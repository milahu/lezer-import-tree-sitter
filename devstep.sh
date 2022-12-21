
false &&
node src/import-scanner.js \
test/cases/tree-sitter-cpp/src/scanner.cc \
test/cases/tree-sitter-cpp/src/grammar.json

false && node src/import-scanner.js \
test/cases/tree-sitter-bash/src/scanner.cc \
test/cases/tree-sitter-bash/src/grammar.json

( cd test/cases/bash/lezer-parser-bash/; npm run build 2>lezer-generator.err.txt )
