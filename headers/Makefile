NAME		:= $(shell node -p 'require(`./package.json`).name')
VERSION		:= $(shell node -p 'require(`./package.json`).version')

all:		build

prepare:
	yarn

build:		prepare
	yarn run tsc

docs:
	yarn run typedoc --ignoreCompilerErrors --out docs --mode library --theme minimal --inputFiles src/index.ts

test:		prepare
	yarn jest

clean:
	rm -rf build docs coverage

distclean:	clean
	rm -rf node_modules

tag:
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)
	git tag -s headers-v$(VERSION) -m "$(NAME) v$(VERSION)"

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" && "$$(git describe)" == headers-v$(VERSION) ]] || (git describe; git status; false)
	yarn publish --non-interactive --access public

.PHONY:		all prepare build docs test clean distclean tag publish
