all:	build

prepare:
	yarn

build::	prepare

distclean::
	rm -rf node_modules

build test clean distclean::
	$(MAKE) -C headers $@
	$(MAKE) -C web-service $@
	$(MAKE) -C uri $@
	$(MAKE) -C uri-image-parser $@

.PHONY:		all prepare build test clean distclean
