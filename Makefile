all:	build

prepare:
	yarn

build::	prepare
	yarn run tsc --build

distclean::
	rm -rf node_modules

docs test clean distclean::
	$(MAKE) -C headers $@
	$(MAKE) -C uri $@
	$(MAKE) -C uri-image-parser $@
	$(MAKE) -C web-service $@
	$(MAKE) -C x4e $@

.PHONY:		all prepare build docs test clean distclean
