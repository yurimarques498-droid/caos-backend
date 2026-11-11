require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

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
   CATALOGO DE DEMONSTRACAO (server-side, dados ficticios)
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
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = rng(SEED);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const between = (min, max) => min + Math.floor(R() * (max - min + 1));

const BRANDS = {
  'Caos Alpha': { prefix: 'ALP' },
  'Caos Beta': { prefix: 'BET' },
  'Caos Gamma': { prefix: 'GAM' },
  'Caos Delta': { prefix: 'DEL' }
};

const TIERS = [
  { name: 'Mix', tc: '#9aa3b0' },
  { name: 'Gold', tc: '#e6b950' },
  { name: 'Platinum', tc: '#dbe3ec' },
  { name: 'Black', tc: '#7b8391' },
  { name: 'Infinite', tc: '#ff2f41' }
];

const BANKS = [
  'Caos Lab',
  'Nucleo Demo',
  'Estudio Sandbox',
  'Modulo Teste',
  'Unidade Alpha',
  'Unidade Beta'
];

const FIRST = [
  'Lucas', 'Mariana', 'Pedro', 'Julia', 'Rafael', 'Amanda',
  'Felipe', 'Gabriela', 'Thiago', 'Beatriz', 'Carlos', 'Larissa',
  'Bruno', 'Camila', 'Diego', 'Fernanda', 'Gustavo', 'Isabela',
  'Marcos', 'Patricia', 'Vinicius', 'Aline', 'Rodrigo', 'Natalia'
];

const LAST = [
  'Mendes', 'Silva', 'Augusto', 'Costa', 'Santos', 'Oliveira',
  'Rodrigues', 'Ferreira', 'Almeida', 'Lima', 'Souza', 'Pereira',
  'Barbosa', 'Ribeiro', 'Cardoso', 'Moreira', 'Nogueira', 'Teixeira',
  'Rocha', 'Carvalho'
];

// Escada cota de demonstracao -> valor calculado no servidor
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

// Gera identificadores ficticios configuraveis (ex.: 3, 6 ou 12 caracteres)
function genRefCode(length = REF_CODE_LENGTH) {
  const safeLen = Number.isFinite(length) && length >= 3 && length <= 32
    ? Math.floor(length)
    : REF_CODE_LENGTH;
  let code = '';
  for (let i = 0; i < safeLen; i++) {
    code += REF_ALPHABET[Math.floor(R() * REF_ALPHABET.length)];
  }
  return code;
}

const CARDS = new Map(); // id -> item completo de demonstracao (server-side)

(function buildStock() {
  const brandKeys = Object.keys(BRANDS);
  for (let i = 0; i < STOCK_SIZE; i++) {
    const brandName = pick(brandKeys);
    const brand = BRANDS[brandName];
    const tier = TIERS[i % TIERS.length];
    const step = LADDER[i % LADDER.length];
    const limit = step.lim + between(0, 3) * 10;
    const id = 'CX' + String(1000 + i).padStart(4, '0');
    const refCode = genRefCode(REF_CODE_LENGTH);
    const trackingCode = `TRK-${brand.prefix}-${genRefCode(REF_CODE_LENGTH)}`;
    const demoCode = `DEMO-${brand.prefix}-${id}-${refCode}`;

    CARDS.set(id, {
      id,
      brand: brandName,
      tier: tier.name,
      tc: tier.tc,
      bank: pick(BANKS),
      holder: `${pick(FIRST)[0]}. ${pick(LAST)} (DEMO)`.toUpperCase(),
      demoCode,
      masked: `DEMO-${brand.prefix}-••••-${id}`,
      refCode,
      trackingCode,
      limit,
      price: step.price,
      score: Math.round(R() * 1000),
      sold: false
    });
  }
  console.log(`[ESTOQUE] ${CARDS.size} itens de demonstracao gerados (REF_CODE_LENGTH=${REF_CODE_LENGTH})`);
})();

function publicCard(c) {
  return {
    id: c.id,
    brand: c.brand,
    tier: c.tier,
    tc: c.tc,
    bank: c.bank,
    holder: c.holder,
    masked: c.masked,
    refCode: c.refCode,
    trackingCode: c.trackingCode,
    limit: c.limit,
    price: c.price,
    score: c.score
  };
}

app.get('/api/catalog', (req, res) => {
  const cards = [...CARDS.values()].filter((c) => !c.sold).map(publicCard);
  res.json({ total: cards.length, cards });
});

/* =========================================================
   PEDIDOS
   ========================================================= */
const ORDERS = new Map(); // orderId -> pedido
const ORDER_TTL = 20 * 60 * 1000; // 20 min

const PIX_KEYS = [
  'brcode', 'br_code', 'pix_copia_cola', 'copiaecola',
  'pix_copy_paste', 'copy_paste', 'pix_code', 'emv',
  'payload', 'qr_code', 'qrcode', 'code'
];

const isEmv = (s) => typeof s === 'string' && (s.startsWith('000201') || s.includes('br.gov.bcb.pix'));

function findEmv(obj) {
  if (isEmv(obj)) return obj;
  if (!obj || typeof obj !== 'object') return undefined;
  for (const v of Object.values(obj)) {
    const r = findEmv(v);
    if (r) return r;
  }
  return undefined;
}

function findField(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k.toLowerCase()) && v !== undefined && v !== null && v !== '') {
      return v;
    }
  }
  for (const v of Object.values(obj)) {
    const r = findField(v, keys);
    if (r) return r;
  }
  return undefined;
}

function extrairCodigo(body) {
  const direto = findEmv(body);
  if (direto) return direto;
  const bruto = findField(body, PIX_KEYS);
  if (typeof bruto === 'string' && bruto.length > 20) return bruto;
  if (bruto && typeof bruto === 'object') {
    const interno = findEmv(bruto) || findField(bruto, PIX_KEYS);
    if (typeof interno === 'string') return interno;
  }
  return null;
}

// Rate limit simples por IP
const HITS = new Map();

function rateLimit(ip, max = 12, win = 60000) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  if (arr.length >= max) return false;
  arr.push(now);
  HITS.set(ip, arr);
  return true;
}

app.post('/api/checkout', async (req, res) => {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.ip || 'unknown';
    if (!rateLimit(ip)) {
      return res.status(429).json({ error: 'Muitas tentativas, aguarde 1 minuto' });
    }
    if (!ATENAS_API_KEY) {
      return res.status(500).json({ error: 'ATENASPAY_API_KEY nao configurada' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(422).json({ error: 'Carrinho vazio' });
    }
    if (items.length > 10) {
      return res.status(422).json({ error: 'Maximo de 10 itens por pedido' });
    }

    // Resolve e valida itens no servidor
    const linhas = [];
    for (const it of items) {
      if (!it || typeof it !== 'object' || !it.id) {
        return res.status(422).json({ error: 'Item invalido no carrinho' });
      }
      const card = CARDS.get(String(it.id));
      if (!card) {
        return res.status(422).json({ error: `Item invalido: ${it.id}` });
      }
      if (card.sold) {
        return res.status(409).json({ error: `Item ${it.id} ja reservado/vendido` });
      }
      const qty = Math.min(Math.max(parseInt(it.qty, 10) || 1, 1), 5);
      linhas.push({ card, qty });
    }

    // Preco sempre calculado no servidor, nunca recebido do cliente
    const amount = Number(linhas.reduce((s, l) => s + l.card.price * l.qty, 0).toFixed(2));
    const orderId = `ped_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const trackingCode = `PED-${genRefCode(REF_CODE_LENGTH)}`;

    console.log(`[PIX] criando ${orderId} | valor ${amount}`);

    const response = await fetch(`${ATENAS_API_BASE}/api/pix/create`, {
      method: 'POST',
      headers: {
        'x-api-key': ATENAS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount,
        description: `Pedido ${orderId} - ${linhas.length} item(ns)`.slice(0, 140),
        external_id: orderId
      }),
      signal: AbortSignal.timeout(15000)
    });

    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      return res.status(502).json({
        error: `Atenas Pay recusou (HTTP ${response.status})`,
        detalhes: body
      });
    }

    const pixCode = extrairCodigo(body);
    if (!pixCode) {
      return res.status(502).json({
        error: 'Resposta sem codigo Pix reconhecivel',
        detalhes: body
      });
    }

    const atenaId = findField(body, ['id', 'txid', 'transaction_id']) || orderId;

    ORDERS.set(orderId, {
      id: orderId,
      atenaId: String(atenaId),
      trackingCode,
      amount,
      items: linhas.map((l) => ({ id: l.card.id, qty: l.qty, price: l.card.price })),
      status: 'pendente',
      createdAt: Date.now(),
      paidAt: null,
      lastCheck: 0
    });

    res.json({
      order_id: orderId,
      tracking_code: trackingCode,
      amount,
      pix: pixCode,
      expires_in: ORDER_TTL / 1000
    });
  } catch (err) {
    console.error('[CHECKOUT]', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

function entrega(order) {
  return order.items.flatMap((it) => {
    const c = CARDS.get(it.id);
    if (!c) return [];
    return [{
      id: c.id,
      brand: c.brand,
      tier: c.tier,
      bank: c.bank,
      demoCode: c.demoCode,
      refCode: c.refCode,
      trackingCode: c.trackingCode,
      holder: c.holder,
      limit: c.limit,
      qty: it.qty
    }];
  });
}

function marcarPago(order, origem) {
  if (order.status === 'pago') return;
  order.status = 'pago';
  order.paidAt = Date.now();
  order.items.forEach((it) => {
    const c = CARDS.get(it.id);
    if (c) c.sold = true;
  });
  console.log(`[PAGO] ${order.id} via ${origem}`);
}

app.get('/api/order/:id', async (req, res) => {
  const order = ORDERS.get(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Pedido nao encontrado' });
  }

  if (order.status === 'pago') {
    return res.json({ status: 'pago', tracking_code: order.trackingCode, cards: entrega(order) });
  }

  if (Date.now() - order.createdAt > ORDER_TTL) {
    order.status = 'expirado';
    return res.json({ status: 'expirado', tracking_code: order.trackingCode });
  }

  // Consulta ativa na Atenas (throttle 3s) - funciona mesmo sem webhook
  if (ATENAS_API_KEY && Date.now() - order.lastCheck > 3000) {
    order.lastCheck = Date.now();
    try {
      const r = await fetch(`${ATENAS_API_BASE}/api/pix/${encodeURIComponent(order.atenaId)}`, {
        headers: { 'x-api-key': ATENAS_API_KEY },
        signal: AbortSignal.timeout(10000)
      });
      const b = await r.json().catch(() => null);
      const raw = String(findField(b, ['status']) || '').toLowerCase();
      if (['paid', 'confirmed', 'approved', 'completed', 'concluida', 'pago', 'success'].includes(raw)) {
        marcarPago(order, 'polling');
      }
    } catch (e) {
      /* silencioso para manter polling resiliente */
    }
  }

  if (order.status === 'pago') {
    return res.json({ status: 'pago', tracking_code: order.trackingCode, cards: entrega(order) });
  }

  res.json({ status: 'pendente', tracking_code: order.trackingCode });
});

/* =========================================================
   WEBHOOK (opcional, deixa a confirmacao instantanea)
   ========================================================= */
app.post('/api/webhook/atena', (req, res) => {
  res.sendStatus(200); // Responde rapido para o provedor nao reenviar
  try {
    const body = req.body || {};
    const raw = String(findField(body, ['status', 'situacao']) || '').toLowerCase();
    const pago = ['paid', 'confirmed', 'approved', 'completed', 'pago', 'concluida', 'success'].includes(raw);
    if (!pago) return;

    const ref = findField(body, ['external_id', 'externalid', 'reference', 'referencia'])
      || findField(body, ['id', 'txid', 'transaction_id']);

    if (!ref) return;

    let order = ORDERS.get(String(ref));
    if (!order) {
      order = [...ORDERS.values()].find((o) => o.atenaId === String(ref));
    }
    if (order) {
      marcarPago(order, 'webhook');
    }
  } catch (e) {
    console.error('[WEBHOOK]', e.message);
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    estoque: [...CARDS.values()].filter((c) => !c.sold).length,
    ref_code_length: REF_CODE_LENGTH
  });
});

// Tratamento de rotas inexistentes e erros JSON
app.use((req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada' });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON invalido no corpo da requisicao' });
  }
  console.error('[ERRO]', err);
  return res.status(500).json({ error: 'Erro interno do servidor' });
});

// Limpeza periodica de pedidos nao pagos expirados
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, o] of ORDERS) {
    if (o.status !== 'pago' && now - o.createdAt > ORDER_TTL * 2) {
      ORDERS.delete(id);
    }
  }
}, 60000);
cleanupTimer.unref();

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Backend na porta ${PORT}`);
});
