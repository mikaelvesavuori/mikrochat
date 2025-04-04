#!/bin/bash

rm -rf releases
mkdir releases

npm run build

zip -r releases/mikrochat.app.zip dist
zip releases/mikrochat.bundled.zip lib/mikrochat.bundled.cjs
zip releases/mikrochat.bundled.zip lib/mikrochat.bundled.mjs
