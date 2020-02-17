all:		build

prepare:
	yarn

build:		prepare
	yarn run tsc

docs:
	yarn run typedoc --ignoreCompilerErrors --out docs --mode library --entryPoint '"src/index"'

test:		build
	-yarn run nyc --reporter=lcov --reporter=html alsatian build/test/*.js
	yarn run nyc report

clean:
	rm -rf build docs .nyc_output coverage node_modules/.cache/nyc

distclean:	clean
	rm -rf node_modules

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" && "$$(git describe)" =~ ^v[0-9]+\.[0-9]+\.[0-9]$$ ]] || (git describe; git status; false)
	yarn publish --non-interactive --access public

.PHONY:		all prepare build docs test clean distclean publish
