export async function GET(request: Request) {
  const size = Number(new URL(request.url).searchParams.get("size"));
  if (size !== 192 && size !== 512) {
    return new Response("Not found", { status: 404 });
  }
  const path = size === 192 ? "/chess-logo-192.png" : "/chess-logo-512.png";
  const image = await fetch(new URL(path, request.url));
  if (!image.ok) return new Response("Icon unavailable", { status: 503 });
  return new Response(image.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
