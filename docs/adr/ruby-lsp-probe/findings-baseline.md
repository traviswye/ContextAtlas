# ruby-lsp probe findings

Raw behavior capture from ruby-lsp 0.26.x + ruby-lsp-rails 0.4.8
(stable-compatible pair per bundler resolution at May 2026)
against a minimal Rails 8 fixture. Produced by
`scripts/ruby-lsp-probe.ts` on 2026-05-16T03:13:00.627Z.

Purpose: ground ADR-21's LSP primitive mappings and Limitations
sections in observed behavior — empirical-probe-substrate-before-
ADR-authoring discipline per ADR-13 (Pyright) + ADR-14 (gopls)
precedent.

**Version targets.** Ruby 4.0.3 (cohort-actual-version
anchor per v0.9 Stream A Phase 1 lock), Rails 8.0, ruby-lsp
0.26.x (latest 0.26.9), ruby-lsp-rails 0.4.8 (auto-loaded
when Rails detected). Doctor's warn-not-error pattern
supports earlier Ruby 3.3.x cohort developers.

**Version pinning rationale** (Option D adjudication; cycle-
observation 24 fourth surface): per actual bundler resolution,
ruby-lsp-rails 0.4.8 depends on ruby-lsp `>= 0.26.0, < 0.27.0`.
ruby-lsp 0.27+ (Rubydex-backed indexer; landed in pre-release
per Rails-at-Scale 2026-05-12) is NOT in scope at v1.0; v1.1
candidate tracks the upgrade. 0.26.x is still pre-Rubydex,
so probe-findings on findReferences reflect pre-Rubydex
coverage shape at the most recent pre-Rubydex stable patch.

**Path β + δ adjudication note** (Substep 3 close): this file
captures ruby-lsp baseline-only behavior. The ruby-lsp-rails
add-on requires a fully-bootable Rails app to load — its Rails-
runner subprocess runs the complete Rails boot sequence. The
synthetic probe fixture cannot satisfy that requirement without
substantial fixture rework (full `rails new` shape). Add-on-
enabled empirical substrate composes from Substep 5 work-repo
qualitative observations against a real Rails codebase; ADR-21
§probe #6 (Rails DSL surface) is the A/B framing target.

## Boot — fixture

- Spawn pattern: bundler (`bundle.bat exec ruby-lsp`)
- Fixture: `C:\CodeWork\contextatlas\test\fixtures\ruby-probe`
- .rb files: 13
  - `application_controller.rb`
  - `posts_controller.rb`
  - `application_record.rb`
  - `sluggable.rb`
  - `post.rb`
  - `user.rb`
  - `broken.rb`
  - `application.rb`
  - `boot.rb`
  - `environment.rb`
  - `consumer.rb`
  - `analytics.rb`
  - `dynamic_methods.rb`

### initialize response — capabilities

_Load-bearing for ADR-21: the `capabilities` field below is the
authoritative answer for which LSP methods ruby-lsp advertises_
_support for (implementation, typeDefinition, references,_
_etc.). Per fresh-read of the design-and-roadmap doc,_
_implementation + typeDefinition are NOT mentioned as_
_supported; this capture confirms-or-falsifies that._

```json
{
  "positionEncoding": "utf-16",
  "textDocumentSync": {
    "openClose": true,
    "change": 2
  },
  "completionProvider": {
    "triggerCharacters": [
      "/",
      "\"",
      "'",
      ":",
      "@",
      ".",
      "=",
      "<",
      "$"
    ],
    "resolveProvider": true,
    "completionItem": {
      "labelDetailsSupport": true
    }
  },
  "hoverProvider": {},
  "signatureHelpProvider": {
    "triggerCharacters": [
      "(",
      " ",
      ","
    ]
  },
  "definitionProvider": true,
  "referencesProvider": true,
  "documentHighlightProvider": true,
  "documentSymbolProvider": {},
  "codeActionProvider": {
    "documentSelector": null,
    "resolveProvider": true
  },
  "codeLensProvider": {
    "resolveProvider": true
  },
  "documentLinkProvider": {},
  "documentRangeFormattingProvider": true,
  "documentOnTypeFormattingProvider": {
    "documentSelector": null,
    "firstTriggerCharacter": "{",
    "moreTriggerCharacter": [
      "\n",
      "|",
      "d"
    ]
  },
  "renameProvider": {
    "prepareProvider": true
  },
  "foldingRangeProvider": true,
  "selectionRangeProvider": true,
  "semanticTokensProvider": {
    "documentSelector": null,
    "legend": {
      "tokenTypes": [
        "namespace",
        "type",
        "class",
        "enum",
        "interface",
        "struct",
        "typeParameter",
        "parameter",
        "variable",
        "property",
        "enumMember",
        "event",
        "function",
        "method",
        "macro",
        "keyword",
        "modifier",
        "comment",
        "string",
        "number",
        "regexp",
        "operator",
        "decorator"
      ],
      "tokenModifiers": [
        "declaration",
        "definition",
        "readonly",
        "static",
        "deprecated",
        "abstract",
        "async",
        "modification",
        "documentation",
        "defaultLibrary"
      ]
    },
    "range": true,
    "full": {
      "delta": true
    }
  },
  "typeHierarchyProvider": {},
  "inlayHintProvider": {},
  "diagnosticProvider": {
    "documentSelector": null,
    "interFileDependencies": false,
    "workspaceDiagnostics": false
  },
  "workspaceSymbolProvider": true,
  "experimental": {
    "addon_detection": true,
    "compose_bundle": true,
    "go_to_relevant_file": true,
    "full_test_discovery": true
  }
}
```

### serverInfo

```json
{
  "name": "Ruby LSP",
  "version": "0.26.9"
}
```

## Cold-start readiness — $/progress traffic

Captures every $/progress event received during init + warmup.
Determines whether ruby-lsp follows gopls pattern (clean BEGIN/END
frames for workspace setup; adapter can race init against ceiling)
or Pyright pattern (no signal; per-call ceiling absorbs cold-start).
Result drives ADR-21 §readiness-pattern decision per ADR-18.

```json
[]
```

### server messages (log + show)

Surfaces setup warnings — particularly ruby-lsp-rails add-on auto-
load status messages. Rails detection failure should surface here.

```json
[
  {
    "channel": "log",
    "type": 4,
    "message": "Initializing Ruby LSP v0.26.9 https://github.com/Shopify/ruby-lsp/releases/tag/v0.26.9...."
  },
  {
    "channel": "log",
    "type": 4,
    "message": "Auto detected formatter: none (no formatter detected)"
  },
  {
    "channel": "log",
    "type": 4,
    "message": "Auto detected linters: "
  },
  {
    "channel": "log",
    "type": 4,
    "message": "Detected test library: rails (bin/rails present)"
  },
  {
    "channel": "log",
    "type": 4,
    "message": "Finished initializing Ruby LSP!"
  },
  {
    "channel": "log",
    "type": 4,
    "message": "Activating Ruby LSP Rails add-on v0.4.8"
  },
  {
    "channel": "log",
    "type": 4,
    "message": "Ruby LSP Rails booting server"
  }
]
```

## Probe #1 — documentSymbol

Full documentSymbol tree for the 6 load-bearing fixture files.
ruby-lsp-rails enhances Rails-detected files (app/ paths);
baseline ruby-lsp handles plain Ruby (lib/). The add-on delta
surfaces by comparing the two sets — see probe #6 for the
focused delta analysis.

Files in scope: app/models/user.rb, app/models/post.rb,
app/models/concerns/sluggable.rb, app/controllers/posts_controller.rb,
lib/analytics.rb, lib/dynamic_methods.rb.


### app/models/user.rb

```json
[
  {
    "name": "User",
    "kind": 5,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 35,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    },
    "children": [
      {
        "name": "PREMIUM_TIER_LIMIT",
        "kind": 14,
        "range": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 27
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 20
          }
        },
        "children": []
      },
      {
        "name": "has_many :posts",
        "kind": 6,
        "range": {
          "start": {
            "line": 3,
            "character": 11
          },
          "end": {
            "line": 3,
            "character": 17
          }
        },
        "selectionRange": {
          "start": {
            "line": 3,
            "character": 12
          },
          "end": {
            "line": 3,
            "character": 17
          }
        }
      },
      {
        "name": "has_one :profile",
        "kind": 6,
        "range": {
          "start": {
            "line": 4,
            "character": 10
          },
          "end": {
            "line": 4,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 4,
            "character": 11
          },
          "end": {
            "line": 4,
            "character": 18
          }
        }
      },
      {
        "name": "scope :active",
        "kind": 6,
        "range": {
          "start": {
            "line": 8,
            "character": 8
          },
          "end": {
            "line": 8,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 8,
            "character": 9
          },
          "end": {
            "line": 8,
            "character": 15
          }
        }
      },
      {
        "name": "scope :recent",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 8
          },
          "end": {
            "line": 9,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 9
          },
          "end": {
            "line": 9,
            "character": 15
          }
        }
      },
      {
        "name": "scope :by_role",
        "kind": 6,
        "range": {
          "start": {
            "line": 10,
            "character": 8
          },
          "end": {
            "line": 10,
            "character": 16
          }
        },
        "selectionRange": {
          "start": {
            "line": 10,
            "character": 9
          },
          "end": {
            "line": 10,
            "character": 16
          }
        }
      },
      {
        "name": "validates :email",
        "kind": 6,
        "range": {
          "start": {
            "line": 12,
            "character": 12
          },
          "end": {
            "line": 12,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 12,
            "character": 13
          },
          "end": {
            "line": 12,
            "character": 18
          }
        }
      },
      {
        "name": "validates :name",
        "kind": 6,
        "range": {
          "start": {
            "line": 13,
            "character": 12
          },
          "end": {
            "line": 13,
            "character": 17
          }
        },
        "selectionRange": {
          "start": {
            "line": 13,
            "character": 13
          },
          "end": {
            "line": 13,
            "character": 17
          }
        }
      },
      {
        "name": "before_save :normalize_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 15,
            "character": 14
          },
          "end": {
            "line": 15,
            "character": 30
          }
        },
        "selectionRange": {
          "start": {
            "line": 15,
            "character": 15
          },
          "end": {
            "line": 15,
            "character": 30
          }
        }
      },
      {
        "name": "after_create :send_welcome_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 16,
            "character": 15
          },
          "end": {
            "line": 16,
            "character": 34
          }
        },
        "selectionRange": {
          "start": {
            "line": 16,
            "character": 16
          },
          "end": {
            "line": 16,
            "character": 34
          }
        }
      },
      {
        "name": "display_name",
        "kind": 6,
        "range": {
          "start": {
            "line": 18,
            "character": 2
          },
          "end": {
            "line": 20,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 18,
            "character": 6
          },
          "end": {
            "line": 18,
            "character": 18
          }
        },
        "children": []
      },
      {
        "name": "self.find_by_email",
        "kind": 12,
        "range": {
          "start": {
            "line": 22,
            "character": 2
          },
          "end": {
            "line": 24,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 22,
            "character": 11
          },
          "end": {
            "line": 22,
            "character": 24
          }
        },
        "children": []
      },
      {
        "name": "normalize_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 28,
            "character": 2
          },
          "end": {
            "line": 30,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 28,
            "character": 6
          },
          "end": {
            "line": 28,
            "character": 21
          }
        },
        "children": []
      },
      {
        "name": "send_welcome_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 32,
            "character": 2
          },
          "end": {
            "line": 34,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 32,
            "character": 6
          },
          "end": {
            "line": 32,
            "character": 24
          }
        },
        "children": []
      }
    ]
  }
]
```

### app/models/post.rb

```json
[
  {
    "name": "Post",
    "kind": 5,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 25,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    },
    "children": [
      {
        "name": "belongs_to :user",
        "kind": 6,
        "range": {
          "start": {
            "line": 3,
            "character": 13
          },
          "end": {
            "line": 3,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 3,
            "character": 14
          },
          "end": {
            "line": 3,
            "character": 18
          }
        }
      },
      {
        "name": "has_and_belongs_to_many :tags",
        "kind": 6,
        "range": {
          "start": {
            "line": 4,
            "character": 26
          },
          "end": {
            "line": 4,
            "character": 31
          }
        },
        "selectionRange": {
          "start": {
            "line": 4,
            "character": 27
          },
          "end": {
            "line": 4,
            "character": 31
          }
        }
      },
      {
        "name": "scope :published",
        "kind": 6,
        "range": {
          "start": {
            "line": 8,
            "character": 8
          },
          "end": {
            "line": 8,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 8,
            "character": 9
          },
          "end": {
            "line": 8,
            "character": 18
          }
        }
      },
      {
        "name": "scope :by_user",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 8
          },
          "end": {
            "line": 9,
            "character": 16
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 9
          },
          "end": {
            "line": 9,
            "character": 16
          }
        }
      },
      {
        "name": "validates :title",
        "kind": 6,
        "range": {
          "start": {
            "line": 11,
            "character": 12
          },
          "end": {
            "line": 11,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 11,
            "character": 13
          },
          "end": {
            "line": 11,
            "character": 18
          }
        }
      },
      {
        "name": "before_validation :set_default_status",
        "kind": 6,
        "range": {
          "start": {
            "line": 13,
            "character": 20
          },
          "end": {
            "line": 13,
            "character": 39
          }
        },
        "selectionRange": {
          "start": {
            "line": 13,
            "character": 21
          },
          "end": {
            "line": 13,
            "character": 39
          }
        }
      },
      {
        "name": "excerpt",
        "kind": 6,
        "range": {
          "start": {
            "line": 15,
            "character": 2
          },
          "end": {
            "line": 18,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 15,
            "character": 6
          },
          "end": {
            "line": 15,
            "character": 13
          }
        },
        "children": []
      },
      {
        "name": "set_default_status",
        "kind": 6,
        "range": {
          "start": {
            "line": 22,
            "character": 2
          },
          "end": {
            "line": 24,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 22,
            "character": 6
          },
          "end": {
            "line": 22,
            "character": 24
          }
        },
        "children": []
      }
    ]
  }
]
```

### app/models/concerns/sluggable.rb

```json
[
  {
    "name": "Sluggable",
    "kind": 2,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 23,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 7
      },
      "end": {
        "line": 0,
        "character": 16
      }
    },
    "children": [
      {
        "name": "before_validation :generate_slug",
        "kind": 6,
        "range": {
          "start": {
            "line": 4,
            "character": 22
          },
          "end": {
            "line": 4,
            "character": 36
          }
        },
        "selectionRange": {
          "start": {
            "line": 4,
            "character": 23
          },
          "end": {
            "line": 4,
            "character": 36
          }
        }
      },
      {
        "name": "validates :slug",
        "kind": 6,
        "range": {
          "start": {
            "line": 5,
            "character": 14
          },
          "end": {
            "line": 5,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 5,
            "character": 15
          },
          "end": {
            "line": 5,
            "character": 19
          }
        }
      },
      {
        "name": "find_by_slug!",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 4
          },
          "end": {
            "line": 11,
            "character": 7
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 8
          },
          "end": {
            "line": 9,
            "character": 21
          }
        },
        "children": []
      },
      {
        "name": "to_param",
        "kind": 6,
        "range": {
          "start": {
            "line": 14,
            "character": 2
          },
          "end": {
            "line": 16,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 14,
            "character": 6
          },
          "end": {
            "line": 14,
            "character": 14
          }
        },
        "children": []
      },
      {
        "name": "generate_slug",
        "kind": 6,
        "range": {
          "start": {
            "line": 20,
            "character": 2
          },
          "end": {
            "line": 22,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 20,
            "character": 6
          },
          "end": {
            "line": 20,
            "character": 19
          }
        },
        "children": []
      }
    ]
  }
]
```

### app/controllers/posts_controller.rb

```json
[
  {
    "name": "PostsController",
    "kind": 5,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 41,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 21
      }
    },
    "children": [
      {
        "name": "before_action :set_post",
        "kind": 6,
        "range": {
          "start": {
            "line": 1,
            "character": 16
          },
          "end": {
            "line": 1,
            "character": 25
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 17
          },
          "end": {
            "line": 1,
            "character": 25
          }
        }
      },
      {
        "name": "index",
        "kind": 6,
        "range": {
          "start": {
            "line": 3,
            "character": 2
          },
          "end": {
            "line": 5,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 3,
            "character": 6
          },
          "end": {
            "line": 3,
            "character": 11
          }
        },
        "children": [
          {
            "name": "@posts",
            "kind": 8,
            "range": {
              "start": {
                "line": 4,
                "character": 4
              },
              "end": {
                "line": 4,
                "character": 10
              }
            },
            "selectionRange": {
              "start": {
                "line": 4,
                "character": 4
              },
              "end": {
                "line": 4,
                "character": 10
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "show",
        "kind": 6,
        "range": {
          "start": {
            "line": 7,
            "character": 2
          },
          "end": {
            "line": 8,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 7,
            "character": 6
          },
          "end": {
            "line": 7,
            "character": 10
          }
        },
        "children": []
      },
      {
        "name": "create",
        "kind": 6,
        "range": {
          "start": {
            "line": 10,
            "character": 2
          },
          "end": {
            "line": 17,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 10,
            "character": 6
          },
          "end": {
            "line": 10,
            "character": 12
          }
        },
        "children": [
          {
            "name": "@post",
            "kind": 8,
            "range": {
              "start": {
                "line": 11,
                "character": 4
              },
              "end": {
                "line": 11,
                "character": 9
              }
            },
            "selectionRange": {
              "start": {
                "line": 11,
                "character": 4
              },
              "end": {
                "line": 11,
                "character": 9
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "update",
        "kind": 6,
        "range": {
          "start": {
            "line": 19,
            "character": 2
          },
          "end": {
            "line": 25,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 19,
            "character": 6
          },
          "end": {
            "line": 19,
            "character": 12
          }
        },
        "children": []
      },
      {
        "name": "destroy",
        "kind": 6,
        "range": {
          "start": {
            "line": 27,
            "character": 2
          },
          "end": {
            "line": 30,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 27,
            "character": 6
          },
          "end": {
            "line": 27,
            "character": 13
          }
        },
        "children": []
      },
      {
        "name": "set_post",
        "kind": 6,
        "range": {
          "start": {
            "line": 34,
            "character": 2
          },
          "end": {
            "line": 36,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 34,
            "character": 6
          },
          "end": {
            "line": 34,
            "character": 14
          }
        },
        "children": [
          {
            "name": "@post",
            "kind": 8,
            "range": {
              "start": {
                "line": 35,
                "character": 4
              },
              "end": {
                "line": 35,
                "character": 9
              }
            },
            "selectionRange": {
              "start": {
                "line": 35,
                "character": 4
              },
              "end": {
                "line": 35,
                "character": 9
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "post_params",
        "kind": 6,
        "range": {
          "start": {
            "line": 38,
            "character": 2
          },
          "end": {
            "line": 40,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 38,
            "character": 6
          },
          "end": {
            "line": 38,
            "character": 17
          }
        },
        "children": []
      }
    ]
  }
]
```

### lib/analytics.rb

```json
[
  {
    "name": "Analytics",
    "kind": 2,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 12,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 7
      },
      "end": {
        "line": 0,
        "character": 16
      }
    },
    "children": [
      {
        "name": "VERSION",
        "kind": 14,
        "range": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 9
          }
        },
        "children": []
      },
      {
        "name": "track",
        "kind": 6,
        "range": {
          "start": {
            "line": 5,
            "character": 2
          },
          "end": {
            "line": 7,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 5,
            "character": 6
          },
          "end": {
            "line": 5,
            "character": 11
          }
        },
        "children": []
      },
      {
        "name": "identify",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 2
          },
          "end": {
            "line": 11,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 6
          },
          "end": {
            "line": 9,
            "character": 14
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "greet",
    "kind": 6,
    "range": {
      "start": {
        "line": 24,
        "character": 0
      },
      "end": {
        "line": 26,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 24,
        "character": 4
      },
      "end": {
        "line": 24,
        "character": 9
      }
    },
    "children": []
  }
]
```

### lib/dynamic_methods.rb

```json
[
  {
    "name": "DynamicMethods",
    "kind": 2,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 12,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 7
      },
      "end": {
        "line": 0,
        "character": 21
      }
    },
    "children": [
      {
        "name": "STATUSES",
        "kind": 14,
        "range": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 57
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 10
          }
        },
        "children": []
      },
      {
        "name": "current_status",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 2
          },
          "end": {
            "line": 11,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 6
          },
          "end": {
            "line": 9,
            "character": 20
          }
        },
        "children": []
      }
    ]
  }
]
```

## Probe #2 — findReferences

Probes findReferences across symbol kinds at the pre-Rubydex
baseline (0.26.9). Expected per ruby-lsp roadmap: constants
supported, instance vars + methods on untyped receivers limited.
Probe captures actual 0.26.9 coverage shape.

Mid-probe surprise watch: if 0.26.9 surfaces methods-references
for untyped-receiver cases (i.e., partial Rubydex-style expansion
contrary to roadmap), that's substantive enough to pause and
re-frame ADR-21 Limitations scope.


### User constant (class declaration)

position: `app/models/user.rb` line 1, char 6

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 0
      },
      "end": {
        "line": 9,
        "character": 4
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 12,
        "character": 0
      },
      "end": {
        "line": 12,
        "character": 4
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 15,
        "character": 0
      },
      "end": {
        "line": 15,
        "character": 4
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 34,
        "character": 8
      },
      "end": {
        "line": 34,
        "character": 12
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 0
      },
      "end": {
        "line": 9,
        "character": 4
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 12,
        "character": 0
      },
      "end": {
        "line": 12,
        "character": 4
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 15,
        "character": 0
      },
      "end": {
        "line": 15,
        "character": 4
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 34,
        "character": 8
      },
      "end": {
        "line": 34,
        "character": 12
      }
    }
  }
]
```

### User::PREMIUM_TIER_LIMIT (top-level constant)

position: `app/models/user.rb` line 2, char 2

```json
[]
```

### User#display_name (instance method)

position: `app/models/user.rb` line 19, char 6

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 18,
        "character": 6
      },
      "end": {
        "line": 18,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 19,
        "character": 10
      },
      "end": {
        "line": 19,
        "character": 22
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 18,
        "character": 6
      },
      "end": {
        "line": 18,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 19,
        "character": 10
      },
      "end": {
        "line": 19,
        "character": 22
      }
    }
  }
]
```

### User.find_by_email (class method)

position: `app/models/user.rb` line 23, char 11

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 22,
        "character": 11
      },
      "end": {
        "line": 22,
        "character": 24
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 12,
        "character": 5
      },
      "end": {
        "line": 12,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 22,
        "character": 11
      },
      "end": {
        "line": 22,
        "character": 24
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 12,
        "character": 5
      },
      "end": {
        "line": 12,
        "character": 18
      }
    }
  }
]
```

### User.recent (scope — generates class method)

position: `app/models/user.rb` line 10, char 9

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/post.rb",
    "range": {
      "start": {
        "line": 8,
        "character": 2
      },
      "end": {
        "line": 8,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/post.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 2
      },
      "end": {
        "line": 9,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 8,
        "character": 2
      },
      "end": {
        "line": 8,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 2
      },
      "end": {
        "line": 9,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 10,
        "character": 2
      },
      "end": {
        "line": 10,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/post.rb",
    "range": {
      "start": {
        "line": 8,
        "character": 2
      },
      "end": {
        "line": 8,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/post.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 2
      },
      "end": {
        "line": 9,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 8,
        "character": 2
      },
      "end": {
        "line": 8,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 2
      },
      "end": {
        "line": 9,
        "character": 7
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "range": {
      "start": {
        "line": 10,
        "character": 2
      },
      "end": {
        "line": 10,
        "character": 7
      }
    }
  }
]
```

### Sluggable#to_param (mixin instance method)

position: `app/models/concerns/sluggable.rb` line 15, char 6

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "range": {
      "start": {
        "line": 14,
        "character": 6
      },
      "end": {
        "line": 14,
        "character": 14
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 25,
        "character": 5
      },
      "end": {
        "line": 25,
        "character": 13
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "range": {
      "start": {
        "line": 14,
        "character": 6
      },
      "end": {
        "line": 14,
        "character": 14
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 25,
        "character": 5
      },
      "end": {
        "line": 25,
        "character": 13
      }
    }
  }
]
```

### Sluggable.find_by_slug! (mixin class method via class_methods block)

position: `app/models/concerns/sluggable.rb` line 10, char 8

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/controllers/posts_controller.rb",
    "range": {
      "start": {
        "line": 35,
        "character": 17
      },
      "end": {
        "line": 35,
        "character": 30
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 8
      },
      "end": {
        "line": 9,
        "character": 21
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 28,
        "character": 5
      },
      "end": {
        "line": 28,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/controllers/posts_controller.rb",
    "range": {
      "start": {
        "line": 35,
        "character": 17
      },
      "end": {
        "line": 35,
        "character": 30
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "range": {
      "start": {
        "line": 9,
        "character": 8
      },
      "end": {
        "line": 9,
        "character": 21
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 28,
        "character": 5
      },
      "end": {
        "line": 28,
        "character": 18
      }
    }
  }
]
```

### Analytics.track (module function)

position: `lib/analytics.rb` line 6, char 6

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 31,
        "character": 10
      },
      "end": {
        "line": 31,
        "character": 15
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/lib/analytics.rb",
    "range": {
      "start": {
        "line": 5,
        "character": 6
      },
      "end": {
        "line": 5,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/consumer.rb",
    "range": {
      "start": {
        "line": 31,
        "character": 10
      },
      "end": {
        "line": 31,
        "character": 15
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/lib/analytics.rb",
    "range": {
      "start": {
        "line": 5,
        "character": 6
      },
      "end": {
        "line": 5,
        "character": 11
      }
    }
  }
]
```

## Probe #3 — publishDiagnostics

ruby-lsp uses prism 1.9.0 as its parser substrate.
broken.rb contains a deliberate unclosed-paren parse error;
expected output is a diagnostic with severity error from
prism. Cold-start $/progress traffic was already captured
earlier (see "Cold-start readiness" section above) — that's
the readiness-pattern decision substrate.

Diagnostic counts per opened URI:



### broken.rb diagnostics (prism-emitted parse error)

count: 0

```json
[]
```

## Probe #4 — hover

Probes hover on varied symbol kinds. Compares against
ADR-13 (Pyright omits docstrings) and ADR-14 (gopls
includes them). Drives ADR-21 §getDocstring path
decision.

Fixture has no YARD/RDoc docstrings, so this probe primarily
captures the hover format envelope. Docstring-presence question
informed by what appears for comment-adjacent methods (e.g.,
`# placeholder` comment above send_welcome_email in user.rb).
rbs 4.0.2 sidebar observation: if hover surfaces rbs-derived
type info anywhere, capture it as an additional finding.


### User (class declaration)

position: `app/models/user.rb` line 1, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nUser\n```\n\n**Definitions**: [user.rb](file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb#L1,1-36,4) | [user.rb](file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb#L1,1-36,4)"
  }
}
```

### PREMIUM_TIER_LIMIT (constant)

position: `app/models/user.rb` line 2, char 2

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nUser::PREMIUM_TIER_LIMIT\n```\n\n**Definitions**: [user.rb](file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb#L2,3-2,28) | [user.rb](file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb#L2,3-2,28)"
  }
}
```

### has_many :posts (Rails DSL macro)

position: `app/models/user.rb` line 4, char 2

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nhas_many(name, scope = <default>, **options, &extension)\n```\n\n**Definitions**: [associations.rb](file:///C%3A/Users/Travis/.local/share/gem/ruby/4.0.0/gems/activerecord-8.0.5/lib/active_record/associations.rb#L1302,9-1305,12)\n\n\n\nSpecifies a one-to-many association. The following methods for retrieval and query of\ncollections of associated objects will be added:\n\n+collection+ is a placeholder for the symbol passed as the +name+ argument, so\n<tt>has_many :clients</tt> would add among others <tt>clients.empty?</tt>.\n\n[<tt>collection</tt>]\n  Returns a Relation of all the associated objects.\n  An empty Relation is returned if none are found.\n[<tt>collection<<(object, ...)</tt>]\n  Adds one or more objects to the collection by setting their foreign keys to the collection's primary key.\n  Note that this operation instantly fires update SQL without waiting for the save or update call on the\n  parent object, unless the parent object is a new record.\n  This will also run validations and callbacks of associated object(s).\n[<tt>collection.delete(object, ...)</tt>]\n  Removes one or more objects from the collection by setting their foreign keys to +NULL+.\n  Objects will be in addition destroyed if they're associated with <tt>dependent: :destroy</tt>,\n  and deleted if they're associated with <tt>dependent: :delete_all</tt>.\n\n  If the <tt>:through</tt> option is used, then the join records are deleted (rather than\n  nullified) by default, but you can specify <tt>dependent: :destroy</tt> or\n  <tt>dependent: :nullify</tt> to override this.\n[<tt>collection.destroy(object, ...)</tt>]\n  Removes one or more objects from the collection by running <tt>destroy</tt> on\n  each record, regardless of any dependent option, ensuring callbacks are run.\n\n  If the <tt>:through</tt> option is used, then the join records are destroyed\n  instead, not the objects themselves.\n[<tt>collection=objects</tt>]\n  Replaces the collections content by deleting and adding objects as appropriate. If the <tt>:through</tt>\n  option is true callbacks in the join models are triggered except destroy callbacks, since deletion is\n  direct by default. You can specify <tt>dependent: :destroy</tt> or\n  <tt>dependent: :nullify</tt> to override this.\n[<tt>collection_singular_ids</tt>]\n  Returns an array of the associated objects' ids\n[<tt>collection_singular_ids=ids</tt>]\n  Replace the collection with the objects identified by the primary keys in +ids+. This\n  method loads the models and calls <tt>collection=</tt>. See above.\n[<tt>collection.clear</tt>]\n  Removes every object from the collection. This destroys the associated objects if they\n  are associated with <tt>dependent: :destroy</tt>, deletes them directly from the\n  database if <tt>dependent: :delete_all</tt>, otherwise sets their foreign keys to +NULL+.\n  If the <tt>:through</tt> option is true no destroy callbacks are invoked on the join models.\n  Join models are directly deleted.\n[<tt>collection.empty?</tt>]\n  Returns +true+ if there are no associated objects.\n[<tt>collection.size</tt>]\n  Returns the number of associated objects.\n[<tt>collection.find(...)</tt>]\n  Finds an associated object according to the same rules as ActiveRecord::FinderMethods#find.\n[<tt>collection.exists?(...)</tt>]\n  Checks whether an associated object with the given conditions exists.\n  Uses the same rules as ActiveRecord::FinderMethods#exists?.\n[<tt>collection.build(attributes = {}, ...)</tt>]\n  Returns one or more new objects of the collection type that have been instantiated\n  with +attributes+ and linked to this object through a foreign key, but have not yet\n  been saved.\n[<tt>collection.create(attributes = {})</tt>]\n  Returns a new object of the collection type that has been instantiated\n  with +attributes+, linked to this object through a foreign key, and that has already\n  been saved (if it passed the validation). *Note*: This only works if the base model\n  already exists in the DB, not if it is a new (unsaved) record!\n[<tt>collection.create!(attributes = {})</tt>]\n  Does the same as <tt>collection.create</tt>, but raises ActiveRecord::RecordInvalid\n  if the record is invalid.\n[<tt>collection.reload</tt>]\n  Returns a Relation of all of the associated objects, forcing a database read.\n  An empty Relation is returned if none are found.\n\n==== Example\n\n  class Firm < ActiveRecord::Base\n    has_many :clients\n  end\n\nDeclaring <tt>has_many :clients</tt> adds the following methods (and more):\n\n  firm = Firm.find(2)\n  client = Client.find(6)\n\n  firm.clients                       # similar to Client.where(firm_id: 2)\n  firm.clients << client\n  firm.clients.delete(client)\n  firm.clients.destroy(client)\n  firm.clients = [client]\n  firm.client_ids\n  firm.client_ids = [6]\n  firm.clients.clear\n  firm.clients.empty?                # similar to firm.clients.size == 0\n  firm.clients.size                  # similar to Client.count \"firm_id = 2\"\n  firm.clients.find                  # similar to Client.where(firm_id: 2).find(6)\n  firm.clients.exists?(name: 'ACME') # similar to Client.exists?(name: 'ACME', firm_id: 2)\n  firm.clients.build                 # similar to Client.new(firm_id: 2)\n  firm.clients.create                # similar to Client.create(firm_id: 2)\n  firm.clients.create!               # similar to Client.create!(firm_id: 2)\n  firm.clients.reload\n\nThe declaration can also include an +options+ hash to specialize the behavior of the association.\n\n==== Scopes\n\nYou can pass a second argument +scope+ as a callable (i.e. proc or\nlambda) to retrieve a specific set of records or customize the generated\nquery when you access the associated collection.\n\nScope examples:\n  has_many :comments, -> { where(author_id: 1) }\n  has_many :employees, -> { joins(:address) }\n  has_many :posts, ->(blog) { where(\"max_post_length > ?\", blog.max_post_length) }\n\n==== Extensions\n\nThe +extension+ argument allows you to pass a block into a has_many\nassociation. This is useful for adding new finders, creators, and other\nfactory-type methods to be used as part of the association.\n\nExtension examples:\n  has_many :employees do\n    def find_or_create_by_name(name)\n      first_name, last_name = name.split(\" \", 2)\n      find_or_create_by(first_name: first_name, last_name: last_name)\n    end\n  end\n\n==== Options\n[+:class_name+]\n  Specify the class name of the association. Use it only if that name can't be inferred\n  from the association name. So <tt>has_many :products</tt> will by default be linked\n  to the +Product+ class, but if the real class name is +SpecialProduct+, you'll have to\n  specify it with this option.\n[+:foreign_key+]\n  Specify the foreign key used for the association. By default this is guessed to be the name\n  of this class in lower-case and \"_id\" suffixed. So a Person class that makes a #has_many\n  association will use \"person_id\" as the default <tt>:foreign_key</tt>.\n\n  Setting the <tt>:foreign_key</tt> option prevents automatic detection of the association's\n  inverse, so it is generally a good idea to set the <tt>:inverse_of</tt> option as well.\n[+:foreign_type+]\n  Specify the column used to store the associated object's type, if this is a polymorphic\n  association. By default this is guessed to be the name of the polymorphic association\n  specified on \"as\" option with a \"_type\" suffix. So a class that defines a\n  <tt>has_many :tags, as: :taggable</tt> association will use \"taggable_type\" as the\n  default <tt>:foreign_type</tt>.\n[+:primary_key+]\n  Specify the name of the column to use as the primary key for the association. By default this is +id+.\n[+:dependent+]\n  Controls what happens to the associated objects when\n  their owner is destroyed. Note that these are implemented as\n  callbacks, and \\Rails executes callbacks in order. Therefore, other\n  similar callbacks may affect the <tt>:dependent</tt> behavior, and the\n  <tt>:dependent</tt> behavior may affect other callbacks.\n\n  * <tt>nil</tt> do nothing (default).\n  * <tt>:destroy</tt> causes all the associated objects to also be destroyed.\n  * <tt>:destroy_async</tt> destroys all the associated objects in a background job. <b>WARNING:</b> Do not use\n    this option if the association is backed by foreign key constraints in your database. The foreign key\n    constraint actions will occur inside the same transaction that deletes its owner.\n  * <tt>:delete_all</tt> causes all the associated objects to be deleted directly from the database (so callbacks will not be executed).\n  * <tt>:nullify</tt> causes the foreign keys to be set to +NULL+. Polymorphic type will also be nullified\n    on polymorphic associations. Callbacks are not executed.\n  * <tt>:restrict_with_exception</tt> causes an ActiveRecord::DeleteRestrictionError exception to be raised if there are any associated records.\n  * <tt>:restrict_with_error</tt> causes an error to be added to the owner if there are any associated objects.\n\n  If using with the <tt>:through</tt> option, the association on the join model must be\n  a #belongs_to, and the records which get deleted are the join records, rather than\n  the associated records.\n\n  If using <tt>dependent: :destroy</tt> on a scoped association, only the scoped objects are destroyed.\n  For example, if a Post model defines\n  <tt>has_many :comments, -> { where published: true }, dependent: :destroy</tt> and <tt>destroy</tt> is\n  called on a post, only published comments are destroyed. This means that any unpublished comments in the\n  database would still contain a foreign key pointing to the now deleted post.\n[+:counter_cache+]\n  This option can be used to configure a custom named <tt>:counter_cache.</tt> You only need this option,\n  when you customized the name of your <tt>:counter_cache</tt> on the #belongs_to association.\n[+:as+]\n  Specifies a polymorphic interface (See #belongs_to).\n[+:through+]\n  Specifies an association through which to perform the query. This can be any other type\n  of association, including other <tt>:through</tt> associations. Options for <tt>:class_name</tt>,\n  <tt>:primary_key</tt> and <tt>:foreign_key</tt> are ignored, as the association uses the\n  source reflection.\n\n  If the association on the join model is a #belongs_to, the collection can be modified\n  and the records on the <tt>:through</tt> model will be automatically created and removed\n  as appropriate. Otherwise, the collection is read-only, so you should manipulate the\n  <tt>:through</tt> association directly.\n\n  If you are going to modify the association (rather than just read from it), then it is\n  a good idea to set the <tt>:inverse_of</tt> option on the source association on the\n  join model. This allows associated records to be built which will automatically create\n  the appropriate join model records when they are saved. See\n  {Association Join Models}[rdoc-ref:Associations::ClassMethods@Association+Join+Models]\n  and {Setting Inverses}[rdoc-ref:Associations::ClassMethods@Setting+Inverses] for\n  more detail.\n\n[+:disable_joins+]\n  Specifies whether joins should be skipped for an association. If set to true, two or more queries\n  will be generated. Note that in some cases, if order or limit is applied, it will be done in-memory\n  due to database limitations. This option is only applicable on <tt>has_many :through</tt> associations as\n  +has_many+ alone do not perform a join.\n[+:source+]\n  Specifies the source association name used by #has_many <tt>:through</tt> queries.\n  Only use it if the name cannot be inferred from the association.\n  <tt>has_many :subscribers, through: :subscriptions</tt> will look for either <tt>:subscribers</tt> or\n  <tt>:subscriber</tt> on Subscription, unless a <tt>:source</tt> is given.\n[+:source_type+]\n  Specifies type of the source association used by #has_many <tt>:through</tt> queries where the source\n  association is a polymorphic #belongs_to.\n[+:validate+]\n  When set to +true+, validates new objects added to association when saving the parent object. +true+ by default.\n  If you want to ensure associated objects are revalidated on every update, use +validates_associated+.\n[+:autosave+]\n  If true, always save the associated objects or destroy them if marked for destruction,\n  when saving the parent object. If false, never save or destroy the associated objects.\n  By default, only save associated objects that are new records. This option is implemented as a\n  +before_save+ callback. Because callbacks are run in the order they are defined, associated objects\n  may need to be explicitly saved in any user-defined +before_save+ callbacks.\n\n  Note that NestedAttributes::ClassMethods#accepts_nested_attributes_for sets\n  <tt>:autosave</tt> to <tt>true</tt>.\n[+:inverse_of+]\n  Specifies the name of the #belongs_to association on the associated object\n  that is the inverse of this #has_many association.\n  See {Bi-directional associations}[rdoc-ref:Associations::ClassMethods@Bi-directional+associations]\n  for more detail.\n[+:extend+]\n  Specifies a module or array of modules that will be extended into the association object returned.\n  Useful for defining methods on associations, especially when they should be shared between multiple\n  association objects.\n[+:strict_loading+]\n  When set to +true+, enforces strict loading every time the associated record is loaded through this\n  association.\n[+:ensuring_owner_was+]\n  Specifies an instance method to be called on the owner. The method must return true in order for the\n  associated records to be deleted in a background job.\n[+:query_constraints+]\n  Serves as a composite foreign key. Defines the list of columns to be used to query the associated object.\n  This is an optional option. By default Rails will attempt to derive the value automatically.\n  When the value is set the Array size must match associated model's primary key or +query_constraints+ size.\n[+:index_errors+]\n  Allows differentiation of multiple validation errors from the association records, by including\n  an index in the error attribute name, e.g. +roles[2].level+.\n  When set to +true+, the index is based on association order, i.e. database order, with yet to be\n  persisted new records placed at the end.\n  When set to +:nested_attributes_order+, the index is based on the record order received by\n  nested attributes setter, when accepts_nested_attributes_for is used.\n[:before_add]\n  Defines an {association callback}[rdoc-ref:Associations::ClassMethods@Association+callbacks] that gets triggered <b>before an object is added</b> to the association collection.\n[:after_add]\n  Defines an {association callback}[rdoc-ref:Associations::ClassMethods@Association+callbacks] that gets triggered <b>after an object is added</b> to the association collection.\n[:before_remove]\n  Defines an {association callback}[rdoc-ref:Associations::ClassMethods@Association+callbacks] that gets triggered <b>before an object is removed</b> from the association collection.\n[:after_remove]\n  Defines an {association callback}[rdoc-ref:Associations::ClassMethods@Association+callbacks] that gets triggered <b>after an object is removed</b> from the association collection.\n\nOption examples:\n  has_many :comments, -> { order(\"posted_on\") }\n  has_many :comments, -> { includes(:author) }\n  has_many :people, -> { where(deleted: false).order(\"name\") }, class_name: \"Person\"\n  has_many :tracks, -> { order(\"position\") }, dependent: :destroy\n  has_many :comments, dependent: :nullify\n  has_many :tags, as: :taggable\n  has_many :reports, -> { readonly }\n  has_many :subscribers, through: :subscriptions, source: :user\n  has_many :subscribers, through: :subscriptions, disable_joins: true\n  has_many :comments, strict_loading: true\n  has_many :comments, query_constraints: [:blog_id, :post_id]\n  has_many :comments, index_errors: :nested_attributes_order"
  }
}
```

### scope :active (Rails DSL macro)

position: `app/models/user.rb` line 9, char 2

```json
null
```

### enum :role (Rails DSL macro)

position: `app/models/user.rb` line 7, char 2

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nenum(name, values = <default>, **options)\n```\n\n**Definitions**: [enum.rb](file:///C%3A/Users/Travis/.local/share/gem/ruby/4.0.0/gems/activerecord-8.0.5/lib/active_record/enum.rb#L217,5-220,8)"
  }
}
```

### display_name (instance method)

position: `app/models/user.rb` line 19, char 6

```json
null
```

### find_by_email (class method)

position: `app/models/user.rb` line 23, char 11

```json
null
```

### send_welcome_email (method with adjacent `# placeholder` comment)

position: `app/models/user.rb` line 33, char 6

```json
null
```

### belongs_to :user (Rails DSL macro)

position: `app/models/post.rb` line 4, char 2

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nbelongs_to(name, scope = <default>, **options)\n```\n\n**Definitions**: [associations.rb](file:///C%3A/Users/Travis/.local/share/gem/ruby/4.0.0/gems/activerecord-8.0.5/lib/active_record/associations.rb#L1689,9-1692,12)\n\n\n\nSpecifies a one-to-one association with another class. This method\nshould only be used if this class contains the foreign key. If the\nother class contains the foreign key, then you should use #has_one\ninstead. See {Is it a belongs_to or has_one\nassociation?}[rdoc-ref:Associations::ClassMethods@Is+it+a+-23belongs_to+or+-23has_one+association-3F]\nfor more detail on when to use #has_one and when to use #belongs_to.\n\nMethods will be added for retrieval and query for a single associated object, for which\nthis object holds an id:\n\n+association+ is a placeholder for the symbol passed as the +name+ argument, so\n<tt>belongs_to :author</tt> would add among others <tt>author.nil?</tt>.\n\n[<tt>association</tt>]\n  Returns the associated object. +nil+ is returned if none is found.\n[<tt>association=(associate)</tt>]\n  Assigns the associate object, extracts the primary key, and sets it as the foreign key.\n  No modification or deletion of existing records takes place.\n[<tt>build_association(attributes = {})</tt>]\n  Returns a new object of the associated type that has been instantiated\n  with +attributes+ and linked to this object through a foreign key, but has not yet been saved.\n[<tt>create_association(attributes = {})</tt>]\n  Returns a new object of the associated type that has been instantiated\n  with +attributes+, linked to this object through a foreign key, and that\n  has already been saved (if it passed the validation).\n[<tt>create_association!(attributes = {})</tt>]\n  Does the same as <tt>create_association</tt>, but raises ActiveRecord::RecordInvalid\n  if the record is invalid.\n[<tt>reload_association</tt>]\n  Returns the associated object, forcing a database read.\n[<tt>reset_association</tt>]\n  Unloads the associated object. The next access will query it from the database.\n[<tt>association_changed?</tt>]\n  Returns true if a new associate object has been assigned and the next save will update the foreign key.\n[<tt>association_previously_changed?</tt>]\n  Returns true if the previous save updated the association to reference a new associate object.\n\n==== Example\n\n  class Post < ActiveRecord::Base\n    belongs_to :author\n  end\n\nDeclaring <tt>belongs_to :author</tt> adds the following methods (and more):\n\n  post = Post.find(7)\n  author = Author.find(19)\n\n  post.author           # similar to Author.find(post.author_id)\n  post.author = author  # similar to post.author_id = author.id\n  post.build_author     # similar to post.author = Author.new\n  post.create_author    # similar to post.author = Author.new; post.author.save; post.author\n  post.create_author!   # similar to post.author = Author.new; post.author.save!; post.author\n  post.reload_author\n  post.reset_author\n  post.author_changed?\n  post.author_previously_changed?\n\n==== Scopes\n\nYou can pass a second argument +scope+ as a callable (i.e. proc or\nlambda) to retrieve a specific record or customize the generated query\nwhen you access the associated object.\n\nScope examples:\n  belongs_to :firm, -> { where(id: 2) }\n  belongs_to :user, -> { joins(:friends) }\n  belongs_to :level, ->(game) { where(\"game_level > ?\", game.current_level) }\n\n==== Options\n\nThe declaration can also include an +options+ hash to specialize the behavior of the association.\n\n[+:class_name+]\n  Specify the class name of the association. Use it only if that name can't be inferred\n  from the association name. So <tt>belongs_to :author</tt> will by default be linked to the Author class, but\n  if the real class name is Person, you'll have to specify it with this option.\n[+:foreign_key+]\n  Specify the foreign key used for the association. By default this is guessed to be the name\n  of the association with an \"_id\" suffix. So a class that defines a <tt>belongs_to :person</tt>\n  association will use \"person_id\" as the default <tt>:foreign_key</tt>. Similarly,\n  <tt>belongs_to :favorite_person, class_name: \"Person\"</tt> will use a foreign key\n  of \"favorite_person_id\".\n\n  Setting the <tt>:foreign_key</tt> option prevents automatic detection of the association's\n  inverse, so it is generally a good idea to set the <tt>:inverse_of</tt> option as well.\n[+:foreign_type+]\n  Specify the column used to store the associated object's type, if this is a polymorphic\n  association. By default this is guessed to be the name of the association with a \"_type\"\n  suffix. So a class that defines a <tt>belongs_to :taggable, polymorphic: true</tt>\n  association will use \"taggable_type\" as the default <tt>:foreign_type</tt>.\n[+:primary_key+]\n  Specify the method that returns the primary key of associated object used for the association.\n  By default this is +id+.\n[+:dependent+]\n  If set to <tt>:destroy</tt>, the associated object is destroyed when this object is. If set to\n  <tt>:delete</tt>, the associated object is deleted *without* calling its destroy method. If set to\n  <tt>:destroy_async</tt>, the associated object is scheduled to be destroyed in a background job.\n  This option should not be specified when #belongs_to is used in conjunction with\n  a #has_many relationship on another class because of the potential to leave\n  orphaned records behind.\n[+:counter_cache+]\n  Caches the number of belonging objects on the associate class through the use of CounterCache::ClassMethods#increment_counter\n  and CounterCache::ClassMethods#decrement_counter. The counter cache is incremented when an object of this\n  class is created and decremented when it's destroyed. This requires that a column\n  named <tt>#{table_name}_count</tt> (such as +comments_count+ for a belonging Comment class)\n  is used on the associate class (such as a Post class) - that is the migration for\n  <tt>#{table_name}_count</tt> is created on the associate class (such that <tt>Post.comments_count</tt> will\n  return the count cached). You can also specify a custom counter\n  cache column by providing a column name instead of a +true+/+false+ value to this\n  option (e.g., <tt>counter_cache: :my_custom_counter</tt>.)\n\n  Starting to use counter caches on existing large tables can be troublesome, because the column\n  values must be backfilled separately of the column addition (to not lock the table for too long)\n  and before the use of +:counter_cache+ (otherwise methods like +size+/+any?+/etc, which use\n  counter caches internally, can produce incorrect results). To safely backfill the values while keeping\n  counter cache columns updated with the child records creation/removal and to avoid the mentioned methods\n  use the possibly incorrect counter cache column values and always get the results from the database,\n  use <tt>counter_cache: { active: false }</tt>.\n  If you also need to specify a custom column name, use <tt>counter_cache: { active: false, column: :my_custom_counter }</tt>.\n\n  Note: If you've enabled the counter cache, then you may want to add the counter cache attribute\n  to the +attr_readonly+ list in the associated classes (e.g. <tt>class Post; attr_readonly :comments_count; end</tt>).\n[+:polymorphic+]\n  Specify this association is a polymorphic association by passing +true+.\n  Note: Since polymorphic associations rely on storing class names in the database, make sure to update the class names in the\n  <tt>*_type</tt> polymorphic type column of the corresponding rows.\n[+:validate+]\n  When set to +true+, validates new objects added to association when saving the parent object. +false+ by default.\n  If you want to ensure associated objects are revalidated on every update, use +validates_associated+.\n[+:autosave+]\n  If true, always save the associated object or destroy it if marked for destruction, when\n  saving the parent object.\n  If false, never save or destroy the associated object.\n  By default, only save the associated object if it's a new record.\n\n  Note that NestedAttributes::ClassMethods#accepts_nested_attributes_for\n  sets <tt>:autosave</tt> to <tt>true</tt>.\n[+:touch+]\n  If true, the associated object will be touched (the +updated_at+ / +updated_on+ attributes set to current time)\n  when this record is either saved or destroyed. If you specify a symbol, that attribute\n  will be updated with the current time in addition to the +updated_at+ / +updated_on+ attribute.\n  Please note that no validation will be performed when touching, and only the +after_touch+,\n  +after_commit+, and +after_rollback+ callbacks will be executed.\n[+:inverse_of+]\n  Specifies the name of the #has_one or #has_many association on the associated\n  object that is the inverse of this #belongs_to association.\n  See {Bi-directional associations}[rdoc-ref:Associations::ClassMethods@Bi-directional+associations]\n  for more detail.\n[+:optional+]\n  When set to +true+, the association will not have its presence validated.\n[+:required+]\n  When set to +true+, the association will also have its presence validated.\n  This will validate the association itself, not the id. You can use\n  +:inverse_of+ to avoid an extra query during validation.\n  NOTE: <tt>required</tt> is set to <tt>true</tt> by default and is deprecated. If\n  you don't want to have association presence validated, use <tt>optional: true</tt>.\n[+:default+]\n  Provide a callable (i.e. proc or lambda) to specify that the association should\n  be initialized with a particular record before validation.\n  Please note that callable won't be executed if the record exists.\n[+:strict_loading+]\n  Enforces strict loading every time the associated record is loaded through this association.\n[+:ensuring_owner_was+]\n  Specifies an instance method to be called on the owner. The method must return true in order for the\n  associated records to be deleted in a background job.\n[+:query_constraints+]\n  Serves as a composite foreign key. Defines the list of columns to be used to query the associated object.\n  This is an optional option. By default Rails will attempt to derive the value automatically.\n  When the value is set the Array size must match associated model's primary key or +query_constraints+ size.\n\nOption examples:\n  belongs_to :firm, foreign_key: \"client_of\"\n  belongs_to :person, primary_key: \"name\", foreign_key: \"person_name\"\n  belongs_to :author, class_name: \"Person\", foreign_key: \"author_id\"\n  belongs_to :valid_coupon, ->(o) { where \"discounts > ?\", o.payments_count },\n                            class_name: \"Coupon\", foreign_key: \"coupon_id\"\n  belongs_to :attachable, polymorphic: true\n  belongs_to :project, -> { readonly }\n  belongs_to :post, counter_cache: true\n  belongs_to :comment, touch: true\n  belongs_to :company, touch: :employees_last_updated_at\n  belongs_to :user, optional: true\n  belongs_to :account, default: -> { company.account }\n  belongs_to :account, strict_loading: true\n  belongs_to :note, query_constraints: [:organization_id, :note_id]"
  }
}
```

### ActiveSupport::Concern (constant in module declaration context)

position: `app/models/concerns/sluggable.rb` line 2, char 24

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nActiveSupport::Concern\n```\n\n**Definitions**: [concern.rb](file:///C%3A/Users/Travis/.local/share/gem/ruby/4.0.0/gems/activesupport-8.0.5/lib/active_support/concern.rb#L112,3-216,6)\n\n\n\n= Active Support \\Concern\n\nA typical module looks like this:\n\n  module M\n    def self.included(base)\n      base.extend ClassMethods\n      base.class_eval do\n        scope :disabled, -> { where(disabled: true) }\n      end\n    end\n\n    module ClassMethods\n      ...\n    end\n  end\n\nBy using +ActiveSupport::Concern+ the above module could instead be\nwritten as:\n\n  require \"active_support/concern\"\n\n  module M\n    extend ActiveSupport::Concern\n\n    included do\n      scope :disabled, -> { where(disabled: true) }\n    end\n\n    class_methods do\n      ...\n    end\n  end\n\nMoreover, it gracefully handles module dependencies. Given a +Foo+ module\nand a +Bar+ module which depends on the former, we would typically write the\nfollowing:\n\n  module Foo\n    def self.included(base)\n      base.class_eval do\n        def self.method_injected_by_foo\n          ...\n        end\n      end\n    end\n  end\n\n  module Bar\n    def self.included(base)\n      base.method_injected_by_foo\n    end\n  end\n\n  class Host\n    include Foo # We need to include this dependency for Bar\n    include Bar # Bar is the module that Host really needs\n  end\n\nBut why should +Host+ care about +Bar+'s dependencies, namely +Foo+? We\ncould try to hide these from +Host+ directly including +Foo+ in +Bar+:\n\n  module Bar\n    include Foo\n    def self.included(base)\n      base.method_injected_by_foo\n    end\n  end\n\n  class Host\n    include Bar\n  end\n\nUnfortunately this won't work, since when +Foo+ is included, its <tt>base</tt>\nis the +Bar+ module, not the +Host+ class. With +ActiveSupport::Concern+,\nmodule dependencies are properly resolved:\n\n  require \"active_support/concern\"\n\n  module Foo\n    extend ActiveSupport::Concern\n    included do\n      def self.method_injected_by_foo\n        ...\n      end\n    end\n  end\n\n  module Bar\n    extend ActiveSupport::Concern\n    include Foo\n\n    included do\n      self.method_injected_by_foo\n    end\n  end\n\n  class Host\n    include Bar # It works, now Bar takes care of its dependencies\n  end\n\n=== Prepending concerns\n\nJust like <tt>include</tt>, concerns also support <tt>prepend</tt> with a corresponding\n<tt>prepended do</tt> callback. <tt>module ClassMethods</tt> or <tt>class_methods do</tt> are\nprepended as well.\n\n<tt>prepend</tt> is also used for any dependencies."
  }
}
```

### Analytics (plain Ruby module)

position: `lib/analytics.rb` line 1, char 7

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nAnalytics\n```\n\n**Definitions**: [analytics.rb](file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/lib/analytics.rb#L1,1-13,4) | [analytics.rb](file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/lib/analytics.rb#L1,1-13,4)"
  }
}
```

### module_function (Ruby visibility keyword)

position: `lib/analytics.rb` line 4, char 2

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```ruby\nmodule_function()\n(+4 overloads)\n```\n\n**Definitions**: [module.rbs](file:///C%3A/Users/Travis/.local/share/gem/ruby/4.0.0/gems/rbs-4.0.2/core/module.rbs#L1226,3-1230,94)\n\n\n\n<!--\n  rdoc-file=vm_method.c\n  - module_function                                -> nil\n  - module_function(method_name)                   -> method_name\n  - module_function(method_name, method_name, ...) -> array\n-->\nCreates module functions for the named methods. These functions may be called\nwith the module as a receiver, and also become available as instance methods\nto classes that mix in the module. Module functions are copies of the\noriginal, and so may be changed independently. The instance-method versions\nare made private. If used with no arguments, subsequently defined methods\nbecome module functions. String arguments are converted to symbols. If a\nsingle argument is passed, it is returned. If no argument is passed, nil is\nreturned. If multiple arguments are passed, the arguments are returned as an\narray.\n\n    module Mod\n      def one\n        \"This is one\"\n      end\n      module_function :one\n    end\n    class Cls\n      include Mod\n      def call_one\n        one\n      end\n    end\n    Mod.one     #=> \"This is one\"\n    c = Cls.new\n    c.call_one  #=> \"This is one\"\n    module Mod\n      def one\n        \"This is the new one\"\n      end\n    end\n    Mod.one     #=> \"This is one\"\n    c.call_one  #=> \"This is the new one\""
  }
}
```

## Probe #5 — implementation + typeDefinition

Per fresh-read of ruby-lsp design-and-roadmap, neither method
is documented as supported. Probe captures actual behavior
(JSON-RPC error -32601 / empty result / actual response).
Drives ADR-21 §getTypeInfo decision: confirms Pyright-style
declaration-parse fallback need (ADR-13 precedent) rather than
gopls's clean implementation-endpoint pattern (ADR-14).


### implementation queries


### implementation on User (class)

position: `app/models/user.rb` line 1, char 6

```json
{
  "error": "Error: implementation timed out after 10000ms"
}
```

### implementation on Sluggable (module/Concern)

position: `app/models/concerns/sluggable.rb` line 1, char 7

```json
{
  "error": "Error: implementation timed out after 10000ms"
}
```

### typeDefinition queries


### typeDefinition on `post` local var

position: `consumer.rb` line 19, char 0

```json
{
  "error": "Error: typeDefinition timed out after 10000ms"
}
```

### typeDefinition on User reference site

position: `consumer.rb` line 13, char 0

```json
{
  "error": "Error: typeDefinition timed out after 10000ms"
}
```

## Probe #6 — Rails DSL symbol surface (add-on delta)

The single biggest unknown from fresh-read. Captures which
Rails DSL macros ruby-lsp-rails surfaces in documentSymbol:
has_many, belongs_to, has_one, has_and_belongs_to_many,
scope, enum, validates, before_/after_/around_ callbacks,
ActiveSupport::Concern. Most ADR-21-Limitations-relevant
probe; residual gaps go directly into Limitations section.

Per Path B (Pattern 7 surface 5): external-DSL macros
(acts_as_*, devise integrations) deliberately not in fixture;
cited finding in ADR-21 from ruby-lsp-rails documented scope,
not fixture-probe evidence.

Analysis pattern: compare app/ files (Rails-detected; add-on
enhances) vs lib/ files (plain Ruby; baseline). Probe #1
already captured the raw documentSymbol output; this probe
re-queries with focus on the delta and notes which DSL symbols
surface for downstream Limitations enumeration.

Mid-probe commit-split exception: if findings here warrant
standalone framing (substantively different from documentation-
predicted behavior), surface to Travis/advisor before completing
probes #7–#8 per Pattern 7 boundary discipline.


### Add-on-enhanced: app/models/user.rb (re-query for clarity)

Rails DSL surface in source: has_many, has_one, enum, scope (3x),
validates (2x), before_save, after_create.

```json
[
  {
    "name": "User",
    "kind": 5,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 35,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    },
    "children": [
      {
        "name": "PREMIUM_TIER_LIMIT",
        "kind": 14,
        "range": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 27
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 20
          }
        },
        "children": []
      },
      {
        "name": "has_many :posts",
        "kind": 6,
        "range": {
          "start": {
            "line": 3,
            "character": 11
          },
          "end": {
            "line": 3,
            "character": 17
          }
        },
        "selectionRange": {
          "start": {
            "line": 3,
            "character": 12
          },
          "end": {
            "line": 3,
            "character": 17
          }
        }
      },
      {
        "name": "has_one :profile",
        "kind": 6,
        "range": {
          "start": {
            "line": 4,
            "character": 10
          },
          "end": {
            "line": 4,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 4,
            "character": 11
          },
          "end": {
            "line": 4,
            "character": 18
          }
        }
      },
      {
        "name": "scope :active",
        "kind": 6,
        "range": {
          "start": {
            "line": 8,
            "character": 8
          },
          "end": {
            "line": 8,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 8,
            "character": 9
          },
          "end": {
            "line": 8,
            "character": 15
          }
        }
      },
      {
        "name": "scope :recent",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 8
          },
          "end": {
            "line": 9,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 9
          },
          "end": {
            "line": 9,
            "character": 15
          }
        }
      },
      {
        "name": "scope :by_role",
        "kind": 6,
        "range": {
          "start": {
            "line": 10,
            "character": 8
          },
          "end": {
            "line": 10,
            "character": 16
          }
        },
        "selectionRange": {
          "start": {
            "line": 10,
            "character": 9
          },
          "end": {
            "line": 10,
            "character": 16
          }
        }
      },
      {
        "name": "validates :email",
        "kind": 6,
        "range": {
          "start": {
            "line": 12,
            "character": 12
          },
          "end": {
            "line": 12,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 12,
            "character": 13
          },
          "end": {
            "line": 12,
            "character": 18
          }
        }
      },
      {
        "name": "validates :name",
        "kind": 6,
        "range": {
          "start": {
            "line": 13,
            "character": 12
          },
          "end": {
            "line": 13,
            "character": 17
          }
        },
        "selectionRange": {
          "start": {
            "line": 13,
            "character": 13
          },
          "end": {
            "line": 13,
            "character": 17
          }
        }
      },
      {
        "name": "before_save :normalize_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 15,
            "character": 14
          },
          "end": {
            "line": 15,
            "character": 30
          }
        },
        "selectionRange": {
          "start": {
            "line": 15,
            "character": 15
          },
          "end": {
            "line": 15,
            "character": 30
          }
        }
      },
      {
        "name": "after_create :send_welcome_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 16,
            "character": 15
          },
          "end": {
            "line": 16,
            "character": 34
          }
        },
        "selectionRange": {
          "start": {
            "line": 16,
            "character": 16
          },
          "end": {
            "line": 16,
            "character": 34
          }
        }
      },
      {
        "name": "display_name",
        "kind": 6,
        "range": {
          "start": {
            "line": 18,
            "character": 2
          },
          "end": {
            "line": 20,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 18,
            "character": 6
          },
          "end": {
            "line": 18,
            "character": 18
          }
        },
        "children": []
      },
      {
        "name": "self.find_by_email",
        "kind": 12,
        "range": {
          "start": {
            "line": 22,
            "character": 2
          },
          "end": {
            "line": 24,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 22,
            "character": 11
          },
          "end": {
            "line": 22,
            "character": 24
          }
        },
        "children": []
      },
      {
        "name": "normalize_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 28,
            "character": 2
          },
          "end": {
            "line": 30,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 28,
            "character": 6
          },
          "end": {
            "line": 28,
            "character": 21
          }
        },
        "children": []
      },
      {
        "name": "send_welcome_email",
        "kind": 6,
        "range": {
          "start": {
            "line": 32,
            "character": 2
          },
          "end": {
            "line": 34,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 32,
            "character": 6
          },
          "end": {
            "line": 32,
            "character": 24
          }
        },
        "children": []
      }
    ]
  }
]
```

### Baseline: lib/analytics.rb (plain Ruby; no Rails magic)

Plain Ruby module + module_function — no Rails DSL. Baseline
for what ruby-lsp surfaces without add-on contribution.

```json
[
  {
    "name": "Analytics",
    "kind": 2,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 12,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 7
      },
      "end": {
        "line": 0,
        "character": 16
      }
    },
    "children": [
      {
        "name": "VERSION",
        "kind": 14,
        "range": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 9
          }
        },
        "children": []
      },
      {
        "name": "track",
        "kind": 6,
        "range": {
          "start": {
            "line": 5,
            "character": 2
          },
          "end": {
            "line": 7,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 5,
            "character": 6
          },
          "end": {
            "line": 5,
            "character": 11
          }
        },
        "children": []
      },
      {
        "name": "identify",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 2
          },
          "end": {
            "line": 11,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 6
          },
          "end": {
            "line": 9,
            "character": 14
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "greet",
    "kind": 6,
    "range": {
      "start": {
        "line": 24,
        "character": 0
      },
      "end": {
        "line": 26,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 24,
        "character": 4
      },
      "end": {
        "line": 24,
        "character": 9
      }
    },
    "children": []
  }
]
```

### Add-on-enhanced: app/models/post.rb (mixin via Sluggable)

Post includes Sluggable (ActiveSupport::Concern). Add-on may
surface Sluggable's class_methods + included block contents in
Post's symbol tree.

```json
[
  {
    "name": "Post",
    "kind": 5,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 25,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    },
    "children": [
      {
        "name": "belongs_to :user",
        "kind": 6,
        "range": {
          "start": {
            "line": 3,
            "character": 13
          },
          "end": {
            "line": 3,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 3,
            "character": 14
          },
          "end": {
            "line": 3,
            "character": 18
          }
        }
      },
      {
        "name": "has_and_belongs_to_many :tags",
        "kind": 6,
        "range": {
          "start": {
            "line": 4,
            "character": 26
          },
          "end": {
            "line": 4,
            "character": 31
          }
        },
        "selectionRange": {
          "start": {
            "line": 4,
            "character": 27
          },
          "end": {
            "line": 4,
            "character": 31
          }
        }
      },
      {
        "name": "scope :published",
        "kind": 6,
        "range": {
          "start": {
            "line": 8,
            "character": 8
          },
          "end": {
            "line": 8,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 8,
            "character": 9
          },
          "end": {
            "line": 8,
            "character": 18
          }
        }
      },
      {
        "name": "scope :by_user",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 8
          },
          "end": {
            "line": 9,
            "character": 16
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 9
          },
          "end": {
            "line": 9,
            "character": 16
          }
        }
      },
      {
        "name": "validates :title",
        "kind": 6,
        "range": {
          "start": {
            "line": 11,
            "character": 12
          },
          "end": {
            "line": 11,
            "character": 18
          }
        },
        "selectionRange": {
          "start": {
            "line": 11,
            "character": 13
          },
          "end": {
            "line": 11,
            "character": 18
          }
        }
      },
      {
        "name": "before_validation :set_default_status",
        "kind": 6,
        "range": {
          "start": {
            "line": 13,
            "character": 20
          },
          "end": {
            "line": 13,
            "character": 39
          }
        },
        "selectionRange": {
          "start": {
            "line": 13,
            "character": 21
          },
          "end": {
            "line": 13,
            "character": 39
          }
        }
      },
      {
        "name": "excerpt",
        "kind": 6,
        "range": {
          "start": {
            "line": 15,
            "character": 2
          },
          "end": {
            "line": 18,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 15,
            "character": 6
          },
          "end": {
            "line": 15,
            "character": 13
          }
        },
        "children": []
      },
      {
        "name": "set_default_status",
        "kind": 6,
        "range": {
          "start": {
            "line": 22,
            "character": 2
          },
          "end": {
            "line": 24,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 22,
            "character": 6
          },
          "end": {
            "line": 22,
            "character": 24
          }
        },
        "children": []
      }
    ]
  }
]
```

### Add-on-enhanced: app/controllers/posts_controller.rb (controller DSL)

PostsController uses before_action. Add-on may surface as
a special symbol; or treat as plain method call.

```json
[
  {
    "name": "PostsController",
    "kind": 5,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 41,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 21
      }
    },
    "children": [
      {
        "name": "before_action :set_post",
        "kind": 6,
        "range": {
          "start": {
            "line": 1,
            "character": 16
          },
          "end": {
            "line": 1,
            "character": 25
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 17
          },
          "end": {
            "line": 1,
            "character": 25
          }
        }
      },
      {
        "name": "index",
        "kind": 6,
        "range": {
          "start": {
            "line": 3,
            "character": 2
          },
          "end": {
            "line": 5,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 3,
            "character": 6
          },
          "end": {
            "line": 3,
            "character": 11
          }
        },
        "children": [
          {
            "name": "@posts",
            "kind": 8,
            "range": {
              "start": {
                "line": 4,
                "character": 4
              },
              "end": {
                "line": 4,
                "character": 10
              }
            },
            "selectionRange": {
              "start": {
                "line": 4,
                "character": 4
              },
              "end": {
                "line": 4,
                "character": 10
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "show",
        "kind": 6,
        "range": {
          "start": {
            "line": 7,
            "character": 2
          },
          "end": {
            "line": 8,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 7,
            "character": 6
          },
          "end": {
            "line": 7,
            "character": 10
          }
        },
        "children": []
      },
      {
        "name": "create",
        "kind": 6,
        "range": {
          "start": {
            "line": 10,
            "character": 2
          },
          "end": {
            "line": 17,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 10,
            "character": 6
          },
          "end": {
            "line": 10,
            "character": 12
          }
        },
        "children": [
          {
            "name": "@post",
            "kind": 8,
            "range": {
              "start": {
                "line": 11,
                "character": 4
              },
              "end": {
                "line": 11,
                "character": 9
              }
            },
            "selectionRange": {
              "start": {
                "line": 11,
                "character": 4
              },
              "end": {
                "line": 11,
                "character": 9
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "update",
        "kind": 6,
        "range": {
          "start": {
            "line": 19,
            "character": 2
          },
          "end": {
            "line": 25,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 19,
            "character": 6
          },
          "end": {
            "line": 19,
            "character": 12
          }
        },
        "children": []
      },
      {
        "name": "destroy",
        "kind": 6,
        "range": {
          "start": {
            "line": 27,
            "character": 2
          },
          "end": {
            "line": 30,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 27,
            "character": 6
          },
          "end": {
            "line": 27,
            "character": 13
          }
        },
        "children": []
      },
      {
        "name": "set_post",
        "kind": 6,
        "range": {
          "start": {
            "line": 34,
            "character": 2
          },
          "end": {
            "line": 36,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 34,
            "character": 6
          },
          "end": {
            "line": 34,
            "character": 14
          }
        },
        "children": [
          {
            "name": "@post",
            "kind": 8,
            "range": {
              "start": {
                "line": 35,
                "character": 4
              },
              "end": {
                "line": 35,
                "character": 9
              }
            },
            "selectionRange": {
              "start": {
                "line": 35,
                "character": 4
              },
              "end": {
                "line": 35,
                "character": 9
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "post_params",
        "kind": 6,
        "range": {
          "start": {
            "line": 38,
            "character": 2
          },
          "end": {
            "line": 40,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 38,
            "character": 6
          },
          "end": {
            "line": 38,
            "character": 17
          }
        },
        "children": []
      }
    ]
  }
]
```

## Probe #7 — definition

Cross-file definition probes from consumer.rb reference
sites to their declarations. Composes with zeitwerk 2.7.5
autoload conventions — does ruby-lsp resolve User (loaded
via Rails autoload) without explicit require statements?
Captured here as zeitwerk-compose-observation sidebar.


### User constant reference → user.rb declaration

position: `consumer.rb` line 13, char 0

```json
[
  {
    "targetUri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "targetRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 35,
        "character": 3
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    }
  },
  {
    "targetUri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "targetRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 35,
        "character": 3
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 0,
        "character": 6
      },
      "end": {
        "line": 0,
        "character": 10
      }
    }
  }
]
```

### find_by_email class method → user.rb declaration

position: `consumer.rb` line 13, char 5

```json
[
  {
    "targetUri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "targetRange": {
      "start": {
        "line": 22,
        "character": 2
      },
      "end": {
        "line": 24,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 22,
        "character": 11
      },
      "end": {
        "line": 22,
        "character": 24
      }
    }
  },
  {
    "targetUri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "targetRange": {
      "start": {
        "line": 22,
        "character": 2
      },
      "end": {
        "line": 24,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 22,
        "character": 11
      },
      "end": {
        "line": 22,
        "character": 24
      }
    }
  }
]
```

### recent scope → user.rb declaration

position: `consumer.rb` line 10, char 5

```json
[]
```

### display_name → user.rb declaration

position: `consumer.rb` line 20, char 10

```json
[
  {
    "targetUri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "targetRange": {
      "start": {
        "line": 18,
        "character": 2
      },
      "end": {
        "line": 20,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 18,
        "character": 6
      },
      "end": {
        "line": 18,
        "character": 18
      }
    }
  },
  {
    "targetUri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/user.rb",
    "targetRange": {
      "start": {
        "line": 18,
        "character": 2
      },
      "end": {
        "line": 20,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 18,
        "character": 6
      },
      "end": {
        "line": 18,
        "character": 18
      }
    }
  }
]
```

### find_by_slug! mixin method → sluggable.rb declaration

position: `consumer.rb` line 29, char 5

```json
[
  {
    "targetUri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "targetRange": {
      "start": {
        "line": 9,
        "character": 4
      },
      "end": {
        "line": 11,
        "character": 7
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 9,
        "character": 8
      },
      "end": {
        "line": 9,
        "character": 21
      }
    }
  },
  {
    "targetUri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "targetRange": {
      "start": {
        "line": 9,
        "character": 4
      },
      "end": {
        "line": 11,
        "character": 7
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 9,
        "character": 8
      },
      "end": {
        "line": 9,
        "character": 21
      }
    }
  }
]
```

### to_param mixin method → sluggable.rb declaration

position: `consumer.rb` line 26, char 5

```json
[
  {
    "targetUri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "targetRange": {
      "start": {
        "line": 14,
        "character": 2
      },
      "end": {
        "line": 16,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 14,
        "character": 6
      },
      "end": {
        "line": 14,
        "character": 14
      }
    }
  },
  {
    "targetUri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/app/models/concerns/sluggable.rb",
    "targetRange": {
      "start": {
        "line": 14,
        "character": 2
      },
      "end": {
        "line": 16,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 14,
        "character": 6
      },
      "end": {
        "line": 14,
        "character": 14
      }
    }
  }
]
```

### Analytics.track → analytics.rb declaration

position: `consumer.rb` line 32, char 10

```json
[
  {
    "targetUri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/ruby-probe/lib/analytics.rb",
    "targetRange": {
      "start": {
        "line": 5,
        "character": 2
      },
      "end": {
        "line": 7,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 5,
        "character": 6
      },
      "end": {
        "line": 5,
        "character": 11
      }
    }
  },
  {
    "targetUri": "file:///c:/CodeWork/contextatlas/test/fixtures/ruby-probe/lib/analytics.rb",
    "targetRange": {
      "start": {
        "line": 5,
        "character": 2
      },
      "end": {
        "line": 7,
        "character": 5
      }
    },
    "targetSelectionRange": {
      "start": {
        "line": 5,
        "character": 6
      },
      "end": {
        "line": 5,
        "character": 11
      }
    }
  }
]
```

## Probe #8 — edge cases

Edge cases that document ADR-21 Limitations parallel to
ADR-13's class-header-parser pathological inputs (Pyright)
and ADR-14's build-tag handling (gopls):
- Metaprogramming: define_method-in-enumerable-loop via
  lib/dynamic_methods.rb. Travis-flagged load-bearing case;
  if this hangs or crashes ruby-lsp, surface immediately.
- Mixin chain: Post includes Sluggable; does documentSymbol
  surface inherited methods or only post.rb-explicit ones?
- Inheritance via super: fixture deliberately lacks super calls
  — flagged as fixture-gap finding rather than emit fake-positive.


### documentSymbol on lib/dynamic_methods.rb (define_method-in-loop)

Travis-flagged load-bearing case. If this hangs or crashes
ruby-lsp, the timeout fires and the probe captures the error.
Expected baseline: ruby-lsp surfaces the literal define_method
call as a method symbol, NOT the generated active?/inactive?/
pending?/suspended? predicates — those exist only at runtime.

```json
[
  {
    "name": "DynamicMethods",
    "kind": 2,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 12,
        "character": 3
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 7
      },
      "end": {
        "line": 0,
        "character": 21
      }
    },
    "children": [
      {
        "name": "STATUSES",
        "kind": 14,
        "range": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 57
          }
        },
        "selectionRange": {
          "start": {
            "line": 1,
            "character": 2
          },
          "end": {
            "line": 1,
            "character": 10
          }
        },
        "children": []
      },
      {
        "name": "current_status",
        "kind": 6,
        "range": {
          "start": {
            "line": 9,
            "character": 2
          },
          "end": {
            "line": 11,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 9,
            "character": 6
          },
          "end": {
            "line": 9,
            "character": 20
          }
        },
        "children": []
      }
    ]
  }
]
```

### findReferences on define_method-generated method (`active?`)

Companion to above. If ruby-lsp doesn't surface `active?` as
a symbol, references query lands on the literal string `active`
inside the STATUSES array. Captures behavior either way for
ADR-21 Limitations.

_`:active` needle not found in lib/dynamic_methods.rb_

### documentSymbol on app/models/post.rb (mixin via Sluggable include)

Post includes Sluggable. Most LSPs surface only Post's
explicit symbols (belongs_to, scope, etc.) — not Sluggable's
inherited to_param / find_by_slug! / generate_slug. Captured
from probe #6 above; re-noted here as edge-case verification
of the inheritance-chain limit (in-fixture analog to ADR-13's
class-header-parser cross-language edge-case documentation).

_See probe #6 output for app/models/post.rb documentSymbol._

_Inheritance via super not exercised — fixture lacks super calls._
_Flagged as fixture-gap finding for ADR-21 Limitations rather_
_than emit fake-positive coverage claim. Adapter-implementation_
_phase can extend fixture if super-call resolution evidence_
_is needed._

---

## Real-repo composition (TODO Substep 5)

_Travis weekend dogfood observations against real Rails work-repo._
_Not yet captured — lands in Substep 5._
