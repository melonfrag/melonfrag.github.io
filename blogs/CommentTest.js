var gitalk = new Gitalk({
  clientID: 'ac3230cfd866313210e5',
  clientSecret: '39b2870a1ccd0e77298866da9c8cb441cdbb5ddd',
  repo: 'melonfrag.github.io',
  owner: 'melonfrag',
  admin: ['melonfrag'],
  id: location.pathname,      // Ensure uniqueness and length less than 50
  distractionFreeMode: false  // Facebook-like distraction free mode
})

gitalk.render('gitalk-container')