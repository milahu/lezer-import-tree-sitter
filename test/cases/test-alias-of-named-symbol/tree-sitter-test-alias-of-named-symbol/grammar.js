module.exports = grammar({
  name: "test_alias_of_named_symbol",

  rules: {
    document: $ => repeat(choice($.word, $.parens_word)),
    word: $ => /[a-z]+/,
    parens_word: $ => seq("(", alias($.word, $.word_in_parens), ")"),
  },
});
