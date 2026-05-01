const base = import.meta.env.BASE_URL

const gameModules = import.meta.glob('../games/*.html', {
  eager: true,
  query: '?url',
  import: 'default',
})

const labels = {
  'drinks': 'Drinks',
}

export const games = Object.entries(gameModules)
  .map(([path, href]) => {
    const fileName = path.split('/').pop() ?? ''
    const slug = fileName.replace(/\.html$/i, '')
    const name = labels[slug] ?? slug

    return {
      slug,
      name,
      href: typeof href === 'string' && href.startsWith('/') ? href : `${base}games/${fileName}`,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
