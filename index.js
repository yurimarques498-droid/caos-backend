Require('dotenv').config();
Const express = require('express');
Const cors = require('cors');
Const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : true;

app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '64kb' }));

const ATENAS_API_BASE = process.env.ATENASPAY_API_BASE || 'https://atenaspay.com.br';
const ATENAS_API_KEY = process.env.ATENASPAY_API_KEY;
if (!ATENAS_API_KEY) {
  console.warn('[AVISO] ATENASPAY_API_KEY nao definida no ambiente');
}

/* =========================================================
   CATALOGO DE DEMONSTRACAO (server-side, dados limpios)
   ========================================================= */
const parsedSeed = Number(process.env.CARD_SEED);
const SEED = Number.isFinite(parsedSeed) ? parsedSeed : 20261110;

const parsedStock = parseInt(process.env.STOCK_SIZE || '240', 10);
const STOCK_SIZE = Number.isFinite(parsedStock) && parsedStock > 0 ? parsedStock : 240;

const parsedRefLen = parseInt(process.env.REF_CODE_LENGTH || '6', 10);
const REF_CODE_LENGTH = Number.isFinite(parsedRefLen) && parsedRefLen >= 3 && parsedRefLen <= 32
  ? parsedRefLen
  : 6;

function rng(seed) {
  Let a = seed >>> 0;
  Return () => {
    A += 0x6D2B79F5;
    Let t = a;
    T = Math.imul(t ^ (t >>> 15), t | 1);
    T ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    Return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = rng(SEED);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const between = (min, max) => min + Math.floor(R() * (max - min + 1));

const BRANDS = {
  Visa: { bins: ['423580', '434598', '436712', '401178'], len: 16 },
  Mastercard: { bins: ['523496', '531209', '518842', '544178'], len: 16 },
  Elo: { bins: ['636297', '650442', '636368'], len: 16 },
  Amex: { bins: ['378282', '371449', '375987'], len: 15 }
};

const TIERS = [
  { name: 'Mix', tc: '#9aa3b0' },
  { name: 'Gold', tc: '#e6b950' },
  { name: 'Platinum', tc: '#dbe3ec' },
  { name: 'Black', tc: '#7b8391' },
  { name: 'Infinite', tc: '#ff2f41' }
];

const BANKS = [
  'Neon', 'C6 Bank', 'BTG Pactual', 'Nubank', 'Inter', 'PicPay', 
  'Sicredi', 'Itaú', 'Santander', 'Will Bank', 'Mercado Pago', 'Banco Original'
];

const FIRST = [
  'Maria', 'João', 'Sebastião', 'Antônio', 'José', 'Francisca', 'Ana', 'Carlos', 'Francisco', 'Mariana',
  'Pedro', 'Júlia', 'Rafael', 'Amanda', 'Felipe', 'Gabriela', 'Thiago', 'Beatriz', 'Larissa', 'Bruno',
  'Camila', 'Diego', 'Fernanda', 'Gustavo', 'Isabela', 'Marcos', 'Patrícia', 'Vinícius', 'Aline', 'Rodrigo', 'Natália'
];

const LAST = [
  'Mendes', 'Silva', 'Augusto', 'Costa', 'Santos', 'Oliveira', 'Rodrigues', 'Ferreira', 'Almeida', 'Lima',
  'Souza', 'Pereira', 'Barbosa', 'Ribeiro', 'Cardoso', 'Moreira', 'Nogueira', 'Teixeira', 'Rocha', 'Carvalho'
];

const LADDER = [
  { lim: 150, price: 40 },
  { lim: 180, price: 45 },
  { lim: 210, price: 52 },
  { lim: 240, price: 58 },
  { lim: 270, price: 65 },
  { lim: 300, price: 70 },
  { lim: 340, price: 76 },
  { lim: 380, price: 82 },
  { lim: 420, price: 90 },
  { lim: 450, price: 100 }
];

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genRefCode(length = REF_CODE_LENGTH) {
  Const safeLen = Number.isFinite(length) && length >= 3 && length <= 32
    ? Math.floor(length)
    : REF_CODE_LENGTH;
  Let code = '';
  For (let i = 0; i < safeLen; i++) {
    Code += REF_ALPHABET[Math.floor(R() * REF_ALPHABET.length)];
  }
  Return code;
}

function luhn(s){ 
  Let t = 0, alt = true; 
  For(let i = s.length - 1; i >= 0; i--){ 
    Let d = +s[i]; 
    If(alt){ d *= 2; if(d > 9) d -= 9; } 
    T += d; 
    Alt = !alt; 
  } 
  Return (10 - (t % 10)) % 10; 
}

function genNum(bin, len){ 
  Let b = bin; 
  While(b.length < len - 1) b += Math.floor(R() * 10); 
  Return b + luhn(b); 
}

const CARDS = new Map();

(function buildStock() {
  Const brandKeys = Object.keys(BRANDS);
  Let seq = 1000;
  For (let i = 0; i < STOCK_SIZE; i++) {
    Const bn = pick(brandKeys);
    Const b = BRANDS[bn];
    Const tier = TIERS[i % TIERS.length];
    Const step = LADDER[i % LADDER.length];
    const limit = step.lim + between(0, 3) * 10;
    const full = genNum(pick(b.bins), b.len);
    const id = 'VRT' + (seq++).toString(36).toUpperCase();
    
    CARDS.set(id, {
      Id,
      Brand: bn,
      Tier: tier.name,
      Tc: tier.tc,
      C1: bn === 'Mastercard' ? '#241014' : bn === 'Amex' ? '#0d4a63' : bn === 'Elo' ? '#1a1a20' : '#12225e',
      C2: bn === 'Mastercard' ? '#0a0406' : bn === 'Amex' ? '#03202c' : bn === 'Elo' ? '#050508' : '#060d2c',
      Bank: pick(BANKS),
      Holder: (pick(FIRST)[0] + '. ' + pick(LAST)).toUpperCase(),
      Number: full,
      Masked: full.slice(0, 6) + ' •••• •••• ' + full.slice(-4),
      Exp: String(between(1, 12)).padStart(2, '0') + '/' + between(28, 32),
      Cvv: String(between(100, 999)),
      Limit: limit,
      Price: step.price,
      Score: Math.round(R() * 1000),
      Sold: false
    });
  }
  Console.log(`[ESTOQUE] ${CARDS.size} itens limpios gerados no backend`);
})();

function publicCard(c) {
  Return {
    Id: c.id,
    Brand: c.brand,
    Tier: c.tier,
    Tc: c.tc,
    C1: c.c1,
    C2: c.c2,
    Bank: c.bank,
    Holder: c.holder,
    Masked: c.masked,
    Exp: c.exp,
    Limit: c.limit,
    Price: c.price,
    Score: c.score
  };
}

app.get('/api/catalog', (req, res) => {
  Const cards = [...CARDS.values()].filter((c) => !c.sold).map(publicCard);
  Res.json({ total: cards.length, cards });
});

/* =========================================================
   PEDIDOS E CHECKOUT
   ========================================================= */
const ORDERS = new Map();
const ORDER_TTL = 20 * 60 * 1000;

const PIX_KEYS = [
  'brcode', 'br_code', 'pix_copia_cola', 'copiaecola',
  'pix_copy_paste', 'copy_paste', 'pix_code', 'emv',
  'payload', 'qr_code', 'qrcode', 'code'
];

const isEmv = (s) => typeof s === 'string' && (s.startsWith('000201') || s.includes('br.gov.bcb.pix'));

function findEmv(obj) {
  If (isEmv(obj)) return obj;
  If (!obj || typeof obj !== 'object') return undefined;
  For (const v of Object.values(obj)) {
    Const r = findEmv(v);
    If (r) return r;
  }
  Return undefined;
}

function findField(obj, keys) {
  If (!obj || typeof obj !== 'object') return undefined;
  For (const [k, v] of Object.entries(obj)) {
    If (keys.includes(k.toLowerCase()) && v !== undefined && v !== null && v !== '') {
      Return v;
    }
  }
  For (const v of Object.values(obj)) {
    Const r = findField(v, keys);
    If (r) return r;
  }
  Return undefined;
}

function extrairCodigo(body) {
  Const direto = findEmv(body);
  If (direto) return direto;
  Const bruto = findField(body, PIX_KEYS);
  If (typeof bruto === 'string' && bruto.length > 20) return bruto;
  If (bruto && typeof bruto === 'object') {
    Const interno = findEmv(bruto) || findField(bruto, PIX_KEYS);
    If (typeof interno === 'string') return interno;
  }
  Return null;
}

const HITS = new Map();

function rateLimit(ip, max = 12, win = 60000) {
  Const now = Date.now();
  Const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  If (arr.length >= max) return false;
  Arr.push(now);
  HITS.set(ip, arr);
  Return true;
}

app.post('/api/checkout', async (req, res) => {
  Try {
    Const forwarded = req.headers['x-forwarded-for'];
    Const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.ip || 'unknown';
    If (!rateLimit(ip)) {
      Return res.status(429).json({ error: 'Muitas tentativas, aguarde 1 minuto' });
    }
    If (!ATENAS_API_KEY) {
      Return res.status(500).json({ error: 'ATENASPAY_API_KEY nao configurada' });
    }

    Const items = Array.isArray(req.body?.items) ? req.body.items : [];
    If (!items.length) {
      Return res.status(422).json({ error: 'Carrinho vazio' });
    }
    If (items.length > 10) {
      Return res.status(422).json({ error: 'Maximo de 10 itens por pedido' });
    }

    Const linhas = [];
    For (const it of items) {
      If (!it || typeof it !== 'object' || !it.id) {
        Return res.status(422).json({ error: 'Item invalido no carrinho' });
      }
      Const card = CARDS.get(String(it.id));
      If (!card) {
        Return res.status(422).json({ error: `Item invalido: ${it.id}` });
      }
      If (card.sold) {
        Return res.status(409).json({ error: `Item ${it.id} ja reservado/vendido` });
      }
      Const qty = Math.min(Math.max(parseInt(it.qty, 10) || 1, 1), 5);
      Linhas.push({ card, qty });
    }

    Const amount = Number(linhas.reduce((s, l) => s + l.card.price * l.qty, 0).toFixed(2));
    Const orderId = `ped_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    Const trackingCode = `PED-${genRefCode(6)}`;

    Console.log(`[PIX] criando ${orderId} | valor ${amount}`);

    Const response = await fetch(`${ATENAS_API_BASE}/api/pix/create`, {
      Method: 'POST',
      Headers: {
        'x-api-key': ATENAS_API_KEY,
        'Content-Type': 'application/json'
      },
      Body: JSON.stringify({
        Amount,
        Description: `Pedido ${orderId} - ${linhas.length} item(ns)`.slice(0, 140),
        External_id: orderId
      }),
      Signal: AbortSignal.timeout(15000)
    });

    Const body = await response.json().catch(() => null);
    If (!response.ok || !body) {
      Return res.status(502).json({
        Error: `Atenas Pay recusou (HTTP ${response.status})`,
        Detalhes: body
      });
    }

    Const pixCode = extrairCodigo(body);
    If (!pixCode) {
      Return res.status(502).json({
        Error: 'Resposta sem codigo Pix reconhecivel',
        Detalhes: body
      });
    }

    Const atenaId = findField(body, ['id', 'txid', 'transaction_id']) || orderId;

    ORDERS.set(orderId, {
      Id: orderId,
      AtenaId: String(atenaId),
      TrackingCode: trackingCode,
      Amount,
      Items: linhas.map((l) => ({ id: l.card.id, qty: l.qty, price: l.card.price })),
      Status: 'pendente',
      CreatedAt: Date.now(),
      PaidAt: null,
      LastCheck: 0
    });

    Res.json({
      Order_id: orderId,
      Tracking_code: trackingCode,
      Amount,
      Pix: pixCode,
      Expires_in: ORDER_TTL / 1000
    });
  } catch (err) {
    Console.error('[CHECKOUT]', err);
    Res.status(500).json({ error: 'Erro interno' });
  }
});

function entrega(order) {
  Return order.items.flatMap((it) => {
    Const c = CARDS.get(it.id);
    If (!c) return [];
    Return [{
      Id: c.id,
      Brand: c.brand,
      Tier: c.tier,
      Bank: c.bank,
      Number: c.number,
      Exp: c.exp,
      Cvv: c.cvv,
      Holder: c.holder,
      Limit: c.limit,
      Qty: it.qty
    }];
  });
}

function marcarPago(order, origem) {
  If (order.status === 'pago') return;
  Order.status = 'pago';
  Order.paidAt = Date.now();
  Order.items.forEach((it) => {
    Const c = CARDS.get(it.id);
    If (c) c.sold = true;
  });
  Console.log(`[PAGO] ${order.id} via ${origem}`);
}

app.get('/api/order/:id', async (req, res) => {
  Const order = ORDERS.get(req.params.id);
  If (!order) {
    Return res.status(404).json({ error: 'Pedido nao encontrado' });
  }

  If (order.status === 'pago') {
    Return res.json({ status: 'pago', tracking_code: order.trackingCode, cards: entrega(order) });
  }

  If (Date.now() - order.createdAt > ORDER_TTL) {
    Order.status = 'expirado';
    Return res.json({ status: 'expirado', tracking_code: order.trackingCode });
  }

  If (ATENAS_API_KEY && Date.now() - order.lastCheck > 3000) {
    Order.lastCheck = Date.now();
    Try {
      Const r = await fetch(`${ATENAS_API_BASE}/api/pix/${encodeURIComponent(order.atenaId)}`, {
        Headers: { 'x-api-key': ATENAS_API_KEY },
        Signal: AbortSignal.timeout(10000)
      });
      Const b = await r.json().catch(() => null);
      Const raw = String(findField(b, ['status']) || '').toLowerCase();
      If (['paid', 'confirmed', 'approved', 'completed', 'concluida', 'pago', 'success'].includes(raw)) {
        MarcarPago(order, 'polling');
      }
    } catch (e) {
      /* silencioso */
    }
  }

  If (order.status === 'pago') {
    Return res.json({ status: 'pago', tracking_code: order.trackingCode, cards: entrega(order) });
  }

  Res.json({ status: 'pendente', tracking_code: order.trackingCode });
});

app.post('/api/webhook/atena', (req, res) => {
  Res.sendStatus(200);
  Try {
    Const body = req.body || {};
    Const raw = String(findField(body, ['status', 'situacao']) || '').toLowerCase();
    Const pago = ['paid', 'confirmed', 'approved', 'completed', 'pago', 'concluida', 'success'].includes(raw);
    If (!pago) return;

    Const ref = findField(body, ['external_id', 'externalid', 'reference', 'referencia'])
      || findField(body, ['id', 'txid', 'transaction_id']);

    If (!ref) return;

    Let order = ORDERS.get(String(ref));
    If (!order) {
      Order = [...ORDERS.values()].find((o) => o.atenaId === String(ref));
    }
    If (order) {
      MarcarPago(order, 'webhook');
    }
  } catch (e) {
    Console.error('[WEBHOOK]', e.message);
  }
});

app.get('/health', (req, res) => {
  Res.json({
    Ok: true,
    Estoque: [...CARDS.values()].filter((c) => !c.sold).length
  });
});

app.use((req, res) => {
  Res.status(404).json({ error: 'Rota nao encontrada' });
});

app.use((err, req, res, next) => {
  If (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    Return res.status(400).json({ error: 'JSON invalido no corpo da requisicao' });
  }
  Console.error('[ERRO]', err);
  Return res.status(500).json({ error: 'Erro interno do servidor' });
});

Const cleanupTimer = setInterval(() => {
  Const now = Date.now();
  For (const [id, o] of ORDERS) {
    If (o.status !== 'pago' && now - o.createdAt > ORDER_TTL * 2) {
      ORDERS.delete(id);
    }
  }
}, 60000);
cleanupTimer.unref();

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  Console.log(`Backend na porta ${PORT}`);
});
