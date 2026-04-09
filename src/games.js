const base = import.meta.env.BASE_URL

const gameModules = import.meta.glob('../games/*.html', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const games = Object.entries(gameModules)
  .map(([path, href]) => {
    const fileName = path.split('/').pop() ?? ''
    const name = fileName.replace(/\.html$/i, '')

    return {
      slug: name,
      name,
      href: typeof href === 'string' && href.startsWith('/') ? href : `${base}games/${fileName}`,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
