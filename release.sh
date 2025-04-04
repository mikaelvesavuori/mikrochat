#!/bin/bash

rm -rf releases
mkdir releases

npm run build

zip -r releases/mikrochat.app.zip dist
zip releases/mikrochat.bundled.cjs lib/mikrochat.bundled.cjs
zip releases/mikrochat.bundled.mjs lib/mikrochat.bundled.mjs
