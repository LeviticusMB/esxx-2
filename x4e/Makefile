NAME		:= $(shell node -p 'require(`./package.json`).name')
VERSION		:= $(shell node -p 'require(`./package.json`).version')
BASENAME	:= $(notdir $(NAME))

all:		build

prepare:
	yarn

build:		prepare
	yarn run tsc --build

docs:	build
	rm -rf ../docs/$(BASENAME)
	yarn run typedoc --out ../docs/$(BASENAME) src/index.ts

test:		build
	yarn run jest

clean:
	rm -rf build coverage

distclean:	clean
	rm -rf node_modules

publish:	distclean build test
	@[[ -z "$$(git status --porcelain)" ]] || (git status; false)
	git tag -s $(BASENAME)-v$(VERSION) -m "$(NAME) v$(VERSION)"
	yarn publish --non-interactive --access public

.PHONY:		all prepare build docs test clean distclean publish
