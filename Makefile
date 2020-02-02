all:	build

prepare:
	yarn

build::	prepare

distclean::
	rm -rf node_modules

build test clean distclean::
	$(MAKE) -C headers $@
	$(MAKE) -C uri $@
	$(MAKE) -C uri-image-parser $@
	$(MAKE) -C web-service $@

.PHONY:		all prepare build test clean distclean
