all:		build

prepare:
	yarn

build:		prepare
	npx tsc

test:		build
	-npx nyc --reporter=lcov --reporter=html alsatian build/test/*.js
	npx nyc report

clean:
	rm -rf build .nyc_output coverage node_modules/.cache/nyc

distclean:	clean
	rm -rf node_modules

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" && "$$(git describe)" =~ ^v[0-9]+\.[0-9]+\.[0-9]$$ ]] || (git describe; git status; false)
	yarn publish --non-interactive --access public

.PHONY:		all prepare build test clean distclean publish