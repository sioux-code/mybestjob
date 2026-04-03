export const config = {
  matcher: ['/((?!api|en-construction|_next).*)'],
}

export default function middleware(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const auth = cookieHeader.split(';')
    .map(c => c.trim().split('='))
    .find(([k]) => k === 'mbj-auth');

  if (auth && auth[1] === 'ok') return;

  const url = new URL(request.url);
  url.pathname = '/en-construction.html';
  return Response.redirect(url.toString(), 302);
}
