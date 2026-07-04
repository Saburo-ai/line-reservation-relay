const MAX_BODY_BYTES = 512 * 1024;
const VERSION = "0.1.1";

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return jsonResponse({ ok: true, service: "line-reservation-relay", version: VERSION });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405, {
        Allow: "GET, POST",
      });
    }

    try {
      assertEnvironment(env);

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: "Payload too large" }, 413);
      }

      const lineSignature = request.headers.get("x-line-signature");
      if (!lineSignature) {
        return jsonResponse({ ok: false, error: "Missing signature" }, 401);
      }

      const isValid = await verifyHmacBase64(
        rawBody,
        lineSignature,
        env.LINE_CHANNEL_SECRET,
      );
      if (!isValid) {
        return jsonResponse({ ok: false, error: "Invalid signature" }, 401);
      }

      validateLinePayload(rawBody);

      const timestamp = Date.now();
      const bodyBase64 = bytesToBase64(new TextEncoder().encode(rawBody));
      const relaySignature = await signHmacBase64(
        `${timestamp}.${bodyBase64}`,
        env.RELAY_SHARED_SECRET,
      );
      const relayEnvelope = JSON.stringify({
        version: 2,
        timestamp,
        bodyBase64,
        signature: relaySignature,
      });

      const gasResponse = await fetch(env.GAS_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: relayEnvelope,
        redirect: "follow",
      });

      if (!gasResponse.ok) {
        return jsonResponse({ ok: false, error: "GAS relay failed" }, 502);
      }

      const gasResult = await readJsonSafely(gasResponse);
      if (!gasResult || gasResult.ok !== true) {
        return jsonResponse({ ok: false, error: "GAS rejected the event" }, 502);
      }

      return jsonResponse({ ok: true });
    } catch (error) {
      console.error("Webhook relay error", safeErrorMessage(error));
      return jsonResponse({ ok: false, error: "Internal relay error" }, 500);
    }
  },
};

function assertEnvironment(env) {
  for (const name of [
    "LINE_CHANNEL_SECRET",
    "GAS_WEBHOOK_URL",
    "RELAY_SHARED_SECRET",
  ]) {
    if (!env?.[name]) {
      throw new Error(`Missing Worker secret: ${name}`);
    }
  }

  const target = new URL(env.GAS_WEBHOOK_URL);
  if (target.protocol !== "https:" || target.hostname !== "script.google.com") {
    throw new Error("GAS_WEBHOOK_URL must be an HTTPS script.google.com URL");
  }
}

function validateLinePayload(rawBody) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("LINE payload is not valid JSON");
  }

  if (!payload || typeof payload !== "object" || !Array.isArray(payload.events)) {
    throw new Error("LINE payload does not contain an events array");
  }
}

export async function verifyHmacBase64(message, signature, secret) {
  let signatureBytes;
  try {
    signatureBytes = base64ToBytes(signature);
  } catch {
    return false;
  }

  const key = await importHmacKey(secret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(message),
  );
}

export async function signHmacBase64(message, secret) {
  const key = await importHmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return bytesToBase64(new Uint8Array(signature));
}

async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function base64ToBytes(value) {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Invalid base64");
  }

  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
