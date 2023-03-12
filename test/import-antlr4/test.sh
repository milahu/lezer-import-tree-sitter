#! /usr/bin/env bash

# chdir to project root
cd "$(dirname "$0")"/../..

test_cases="$@"
if [ -z "$test_cases" ]; then
    test_cases=$(find test/import-antlr4/ -mindepth 1 -maxdepth 1 -type d)
fi

# loop test cases
for dir in $test_cases
do

echo
echo "test case: $dir"
name=$(basename "$dir")

d="$dir/lezer-parser-$name/src"
[ -d "$d" ] || mkdir -p "$d"

# TODO handle grammars without lexer
parser=$(ls $dir/antlr4-grammar-$name/*Parser.g4)
lexer=$(ls $dir/antlr4-grammar-$name/*Lexer.g4)
out="$dir/lezer-parser-$name/src/grammar.lezer"
echo "importing from"
echo "  $parser"
echo "  $lexer"
echo "to"
echo "  $out"
echo "node src/import-antlr4 $parser $lexer >$out"
node src/import-antlr4 $parser $lexer >$out

done
