const ace = window.ace;

// Stncil syntax highlighting rules
ace.define(
  "ace/mode/stncil_highlight_rules",
  ["require", "exports", "ace/lib/oop", "ace/mode/text_highlight_rules"],
  function (require, exports) {
    var oop = require("ace/lib/oop");
    var TextHighlightRules = require("ace/mode/text_highlight_rules")
      .TextHighlightRules;

    function StncilHighlightRules() {
      this.$rules = {
        start: [
          // {# comment #}
          {
            token: "comment.block.stncil",
            regex: /\{#/,
            next: "comment-content",
          },
          // {% @style %}...{% @endstyle %}
          {
            token: "keyword.control.stncil",
            regex: /\{%\s*@style\s*%\}/,
            next: "css-content",
          },
          // {% @script %}...{% @endscript %}
          {
            token: "keyword.control.stncil",
            regex: /\{%\s*@script\s*%\}/,
            next: "js-content",
          },
          // {% ... %} block tags
          {
            token: "punctuation.definition.tag.stncil",
            regex: /\{%/,
            next: "block-content",
          },
          // {{ ... }} interpolation
          {
            token: "punctuation.definition.interpolation.stncil",
            regex: /\{\{/,
            next: "interp-content",
          },
          // HTML text content
          { token: "text", regex: /[^{]+/ },
          { token: "text", regex: /{/ },
        ],

        "comment-content": [
          { token: "comment.block.stncil", regex: /#\}/, next: "pop" },
          { token: "comment.block.stncil", regex: /[^#]+/ },
          { token: "comment.block.stncil", regex: /#/ },
        ],

        "block-content": [
          { token: "keyword.control.stncil", regex: /@(?:if|elseif|else|endif|for|endfor|let|render|async|endasync|block|endblock|partial|endpartial|style|endstyle|script|endscript|use|enduse|slot|endslot|in|from|as)\b/ },
          { token: "string", regex: /"(?:[^"\\]|\\.)*"/ },
          { token: "string", regex: /'(?:[^'\\]|\\.)*'/ },
          { token: "constant.numeric", regex: /\b\d+(?:\.\d+)?\b/ },
          { token: "constant.language", regex: /\b(?:true|false|null|undefined)\b/ },
          { token: "keyword.operator.stncil", regex: /\|/ },
          { token: "keyword.operator.stncil", regex: /==|!=|<=|>=|&&|\|\||[+\-*/%()=!<>]/ },
          { token: "variable", regex: /[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/ },
          { token: "punctuation.definition.tag.stncil", regex: /%\}/, next: "pop" },
          { token: "text", regex: /\s+/ },
        ],

        "interp-content": [
          { token: "string", regex: /"(?:[^"\\]|\\.)*"/ },
          { token: "string", regex: /'(?:[^'\\]|\\.)*'/ },
          { token: "constant.numeric", regex: /\b\d+(?:\.\d+)?\b/ },
          { token: "constant.language", regex: /\b(?:true|false|null|undefined)\b/ },
          { token: "keyword.operator.stncil", regex: /\|/ },
          { token: "keyword.operator.stncil", regex: /==|!=|<=|>=|&&|\|\||[+\-*/%()=!<>]/ },
          { token: "variable", regex: /[a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/ },
          { token: "punctuation.definition.interpolation.stncil", regex: /\}\}/, next: "pop" },
          { token: "text", regex: /\s+/ },
        ],

        "css-content": [
          { token: "keyword.control.stncil", regex: /\{%\s*@endstyle\s*%\}/, next: "pop" },
          { defaultToken: "text" },
        ],

        "js-content": [
          { token: "keyword.control.stncil", regex: /\{%\s*@endscript\s*%\}/, next: "pop" },
          { defaultToken: "text" },
        ],
      };

      this.$defaultToken = "text";
    }

    oop.inherits(StncilHighlightRules, TextHighlightRules);
    exports.StncilHighlightRules = StncilHighlightRules;
  }
);

// Stncil mode
ace.define(
  "ace/mode/stncil",
  [
    "require",
    "exports",
    "ace/lib/oop",
    "ace/mode/text",
    "ace/mode/stncil_highlight_rules",
  ],
  function (require, exports) {
    var oop = require("ace/lib/oop");
    var TextMode = require("ace/mode/text").Mode;
    var StncilHighlightRules = require("ace/mode/stncil_highlight_rules")
      .StncilHighlightRules;

    function Mode() {
      this.HighlightRules = StncilHighlightRules;
    }

    oop.inherits(Mode, TextMode);
    exports.Mode = Mode;
  }
);

// Acode plugin registration
class StncilHighlight {
  async init() {
    acode.editorManager.on("switch-file", this.applyMode);
    this.applyMode();
  }

  applyMode() {
    const file = acode.editorManager.activeFile;
    if (file?.name?.endsWith(".stn")) {
      acode.editorManager.editor.session.setMode("ace/mode/stncil");
    }
  }

  async destroy() {
    acode.editorManager.off("switch-file", this.applyMode);
  }
}

module.exports = StncilHighlight;
