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
# TODO handle grammars without lexer
parser=$(ls $dir/antlr4-grammar-$name/*Parser.g4)
lexer=$(ls $dir/antlr4-grammar-$name/*Lexer.g4)
(
  set -x
  # must build lexer first
  antlr4 -Dlanguage=JavaScript $lexer
  antlr4 -Dlanguage=JavaScript $parser
)
# update generated grammar for antlr 4.12.0
# https://github.com/antlr/antlr4/issues/4139
sed -i -E 's/(new antlr4)(.PredictionContextCache\(\))/\1.atn\2/' $dir/antlr4-grammar-$name/*.js
done
