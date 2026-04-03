export const config = {
  matcher: ['/((?!api|en-construction|_next).*)'],
}

export default function middleware(request) {
  const cookie = request.cookies.get('mbj-auth')
  if (cookie?.value === 'ok') return

  const url = new URL(request.url)
  url.pathname = '/en-construction.html'
  return Response.redirect(url.toString(), 302)
}
