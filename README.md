# attestkeep-docs

Documentation, release notes and issue tracking for Attestkeep.

This repository is public so that the documentation is readable and problems
can be reported without an account on our side. Product code lives in private
repositories.

When reporting a problem, please do not paste cluster names, image references,
policy contents, credentials or tokens into a public issue. For security
vulnerabilities use the disclosure process on the site rather than the issue
tracker.

- Documentation: https://docs.attestkeep.com
- Product site: https://attestkeep.com
- Security disclosure: https://attestkeep.com/security.html

The content is readable, not open source — see [LICENSE](LICENSE) for the
short version of what that means.

## Building it

```sh
npm run build      # render + check
npx serve public   # or any static server
```

`src/pages/*.html` are the page bodies. `src/layout.html` is the shell and
`src/nav.json` decides what appears in the sidebar and in what order — a page
missing from it fails the build rather than shipping as an orphan.

`scripts/check.mjs` is the gate: metadata on every page, no dead internal
links, and no leftover reference to the previous brand.

## Türkçe

Attestkeep için dokümantasyon, sürüm notları ve hata takibi.

Bu depo, dokümantasyonun okunabilir olması ve bizim tarafımızda hesap
gerekmeden sorun bildirilebilmesi için publictir. Ürün kodu private depolarda
durur.

Sorun bildirirken lütfen küme adlarını, imaj referanslarını, policy
içeriklerini, kimlik bilgilerini veya token'ları public bir issue'ya
yapıştırmayın. Güvenlik açıkları için hata takibi yerine sitedeki bildirim
sürecini kullanın.
