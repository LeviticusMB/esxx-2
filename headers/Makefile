all:		build

prepare:
	yarn

build:		prepare
	npx tsc

test:		build
	-npx nyc --reporter=lcov --reporter=html alsatian lib/test/*.js
	npx nyc report

clean:
	rm -rf lib .nyc_output coverage node_modules/.cache/nyc

distclean:	clean
	rm -rf node_modules

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" && "$$(git describe)" =~ ^v[0-9]+\.[0-9]+\.[0-9]$$ ]] || (git describe; git status; false)
	yarn publish --non-interactive --access public

.PHONY:		all prepare build clean distclean publish
