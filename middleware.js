export const config = {
  matcher: ['/((?!api/).*)'],
}

export default function middleware(request) {
  const basicAuth = request.headers.get('authorization')

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1]
    const decoded = atob(authValue)
    const pwd = decoded.split(':').slice(1).join(':')
    if (pwd === 'en construction') {
      return
    }
  }

  return new Response('Accès protégé — MyBestJob', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="MyBestJob", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}
