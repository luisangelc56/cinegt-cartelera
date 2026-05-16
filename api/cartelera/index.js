const UPSTREAM =
  process.env.CARTELERA_API_URL ||
  'http://52.171.58.51:8080/api/cartelera';

const UPSTREAM_TIMEOUT_MS = 15000;

module.exports = async function (context, req) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(UPSTREAM, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      context.res = {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: { error: `Upstream HTTP ${response.status}` },
      };
      return;
    }

    const data = await response.json();
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
      body: data,
    };
  } catch (err) {
    clearTimeout(timeout);
    context.log.error('Cartelera proxy error:', err);
    context.res = {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'No se pudo contactar la API de cartelera' },
    };
  }
};
