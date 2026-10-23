// Route-based: only same-origin requests get x-karaoq-demo, so cross-origin
// requests (Google Fonts etc.) are untouched and don't trip CORS.
export async function withDemoHeader(context, baseUrl) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.url().startsWith(baseUrl)) {
      await route.continue({ headers: { ...request.headers(), 'x-karaoq-demo': '1' } });
    } else {
      await route.continue();
    }
  });
  return context;
}
