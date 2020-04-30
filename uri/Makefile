NAME		:= $(shell node -p 'require(`./package.json`).name')
VERSION		:= $(shell node -p 'require(`./package.json`).version')

all:		build

prepare:
	yarn

build:		prepare
	yarn run tsc

docs:
	yarn run typedoc --ignoreCompilerErrors --out docs --mode library --theme minimal --inputFiles src/index.ts

test:		build
	-yarn run nyc --reporter=lcov --reporter=html alsatian build/test/*.js
	yarn run nyc report

clean:
	rm -rf build docs .nyc_output coverage node_modules/.cache/nyc

distclean:	clean
	rm -rf node_modules

tag:
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)
	git tag -s uri-v$(VERSION) -m "$(NAME) v$(VERSION)"

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" && "$$(git describe)" == uri-v$(VERSION) ]] || (git describe; git status; false)
	yarn publish --non-interactive --access public

.PHONY:		all prepare build docs test clean distclean tag publish
