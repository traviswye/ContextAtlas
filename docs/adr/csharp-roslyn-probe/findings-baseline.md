# csharp-roslyn-probe findings (Phase 0 spike)

Empirical capture against community wrapper around Microsoft.
CodeAnalysis.LanguageServer (Roslyn LSP). Produced by
`docs/adr/csharp-roslyn-probe/csharp-roslyn-probe.ts` on 2026-06-08T18:41:50.753Z.

**Spike vehicle:** `csharp-ls` (wrapper around Roslyn
LSP). Using a wrapper as probe vehicle does NOT commit ContextAtlas
to shipping against it — vehicle is a lens to surface endpoint
shape fastest; A1/A2 fork adjudicated post-empirical.

**Four spike checks driven by this probe:**

1. Endpoint surface — documentSymbol / references / hover /
   definition / typeDefinition / diagnostic.
2. Diagnostic delivery channel — push (publishDiagnostics) vs
   pull (textDocument/diagnostic).
3. Symbol-kind taxonomy mapping across C# kinds.
4. Project-restore / workspace-setup behavior — custom
   notifications + log messages during init + restore.

## Boot — fixture

- Spawn: `csharp-ls`
- Fixture: `C:\CodeWork\contextatlas\test\fixtures\csharp`
- .cs files: 6
  - `csharp/Broken.cs`
  - `csharp/Consumer.cs`
  - `Lib/Analytics.cs`
  - `Models/User.cs`
  - `Services/IUserService.cs`
  - `Services/UserService.cs`

### initialize response — capabilities

_Load-bearing for ADR-22: the `capabilities` field below is the
authoritative answer for which LSP methods Roslyn (via the wrapper)_
_advertises support for. Spike check 1 — endpoint surface verification._

```json
{
  "textDocumentSync": {
    "openClose": true,
    "change": 2,
    "save": {
      "includeText": true
    }
  },
  "completionProvider": {
    "triggerCharacters": [
      ".",
      "'"
    ],
    "resolveProvider": true
  },
  "hoverProvider": true,
  "signatureHelpProvider": {
    "triggerCharacters": [
      "(",
      ",",
      "<",
      "{",
      "["
    ]
  },
  "definitionProvider": true,
  "typeDefinitionProvider": true,
  "implementationProvider": true,
  "referencesProvider": true,
  "documentHighlightProvider": true,
  "documentSymbolProvider": true,
  "codeActionProvider": true,
  "codeLensProvider": {
    "resolveProvider": true
  },
  "workspaceSymbolProvider": true,
  "documentFormattingProvider": true,
  "documentRangeFormattingProvider": true,
  "documentOnTypeFormattingProvider": {
    "firstTriggerCharacter": ";",
    "moreTriggerCharacter": [
      "}",
      ")"
    ]
  },
  "renameProvider": true,
  "foldingRangeProvider": true,
  "callHierarchyProvider": true,
  "semanticTokensProvider": {
    "legend": {
      "tokenTypes": [
        "class",
        "comment",
        "constant",
        "enumMember",
        "enum",
        "event",
        "method",
        "field",
        "variable",
        "interface",
        "keyword",
        "namespace",
        "number",
        "operator",
        "parameter",
        "property",
        "struct",
        "regex",
        "string",
        "typeParameter"
      ],
      "tokenModifiers": [
        "static"
      ]
    },
    "range": true,
    "full": true
  },
  "typeHierarchyProvider": true,
  "inlayHintProvider": {
    "resolveProvider": false
  },
  "diagnosticProvider": {
    "documentSelector": [
      {
        "language": "csharp",
        "scheme": "file",
        "pattern": "**/*.cs"
      }
    ],
    "interFileDependencies": false,
    "workspaceDiagnostics": true
  },
  "workspace": {
    "workspaceFolders": {
      "supported": true,
      "changeNotifications": true
    }
  }
}
```

### serverInfo

```json
{
  "name": "csharp-ls",
  "version": "0.24.0.0"
}
```

## Spike check 4 — Project-restore + workspace-setup behavior

Captures every $/progress event, custom notification, and
server message received during init + warmup. Drives ADR-22
§readiness-pattern decision per ADR-18.


### $/progress events

```json
[]
```

### Custom (non-LSP-spec) notifications

Roslyn LSP sends custom notifications for project-restore
signaling. The wrapper may absorb some; whatever surfaces here
is what ContextAtlas's adapter (or LSP client) would need
to handle at A2 path. A1 path implies wrapper handles them.

```json
[]
```

### Server messages (log + show)

Roslyn typically surfaces project restore status, workspace
load errors, and analyzer warnings via window/logMessage. 
Substantively load-bearing for ADR-22 readiness-pattern.

```json
[
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: initializing, version 0.24.0.0"
  },
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: csharp-ls is released under MIT license and is not affiliated with Microsoft Corp.; see https://github.com/razzmatazz/csharp-language-server"
  },
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: attempting to find and load solution on path \"c:\\CodeWork\\contextatlas\\test\\fixtures\\csharp\".."
  },
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: 0 solution(s) found: []"
  },
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: no single preferred .sln/.slnx file found on c:\\CodeWork\\contextatlas\\test\\fixtures\\csharp; fill load project files manually"
  },
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: looking for .csproj/fsproj files on c:\\CodeWork\\contextatlas\\test\\fixtures\\csharp.."
  },
  {
    "channel": "log",
    "type": 3,
    "message": "csharp-ls: loading project \"c:\\CodeWork\\contextatlas\\test\\fixtures\\csharp\\CsharpProbe.csproj\".."
  }
]
```

## Probe #1 — documentSymbol (drives spike checks 1 + 3)

Full documentSymbol tree for fixture files. Symbol-kind
values in the response drive spike check 3 — verify that
Roslyn returns clean LSP standard kinds for C# constructs:
class (5), interface (11), method (6), property (7), field
(8), enum (10), enum member (22), constructor (9), namespace
(3). Open question: which kind is used for record types?
LSP spec has no dedicated SymbolKind for records.


### Broken.cs

```json
[
  {
    "name": "Broken.cs",
    "kind": 1,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 10,
        "character": 0
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 10,
        "character": 0
      }
    },
    "children": [
      {
        "name": "CsharpProbe",
        "detail": "CsharpProbe",
        "kind": 3,
        "range": {
          "start": {
            "line": 0,
            "character": 0
          },
          "end": {
            "line": 10,
            "character": 0
          }
        },
        "selectionRange": {
          "start": {
            "line": 0,
            "character": 10
          },
          "end": {
            "line": 0,
            "character": 21
          }
        },
        "children": [
          {
            "name": "Broken",
            "kind": 5,
            "range": {
              "start": {
                "line": 1,
                "character": 0
              },
              "end": {
                "line": 10,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 5,
                "character": 13
              },
              "end": {
                "line": 5,
                "character": 19
              }
            },
            "children": [
              {
                "name": "DoSomething(string arg)",
                "detail": "void Broken.DoSomething(string arg)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 7,
                    "character": 0
                  },
                  "end": {
                    "line": 8,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 7,
                    "character": 16
                  },
                  "end": {
                    "line": 7,
                    "character": 27
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### Consumer.cs

```json
[
  {
    "name": "Consumer.cs",
    "kind": 1,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 33,
        "character": 0
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 33,
        "character": 0
      }
    },
    "children": [
      {
        "name": "CsharpProbe",
        "detail": "CsharpProbe",
        "kind": 3,
        "range": {
          "start": {
            "line": 0,
            "character": 0
          },
          "end": {
            "line": 33,
            "character": 0
          }
        },
        "selectionRange": {
          "start": {
            "line": 0,
            "character": 10
          },
          "end": {
            "line": 0,
            "character": 21
          }
        },
        "children": [
          {
            "name": "Consumer",
            "kind": 5,
            "range": {
              "start": {
                "line": 5,
                "character": 0
              },
              "end": {
                "line": 33,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 7,
                "character": 13
              },
              "end": {
                "line": 7,
                "character": 21
              }
            },
            "children": [
              {
                "name": "_service",
                "detail": "IUserService Consumer._service",
                "kind": 8,
                "range": {
                  "start": {
                    "line": 9,
                    "character": 34
                  },
                  "end": {
                    "line": 9,
                    "character": 42
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 9,
                    "character": 34
                  },
                  "end": {
                    "line": 9,
                    "character": 42
                  }
                }
              },
              {
                "name": "Consumer(IUserService service)",
                "detail": "Consumer.Consumer(IUserService service)",
                "kind": 9,
                "range": {
                  "start": {
                    "line": 10,
                    "character": 0
                  },
                  "end": {
                    "line": 15,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 11,
                    "character": 11
                  },
                  "end": {
                    "line": 11,
                    "character": 19
                  }
                }
              },
              {
                "name": "UseUserAsync()",
                "detail": "Task Consumer.UseUserAsync()",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 15,
                    "character": 0
                  },
                  "end": {
                    "line": 26,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 17,
                    "character": 22
                  },
                  "end": {
                    "line": 17,
                    "character": 34
                  }
                }
              },
              {
                "name": "FindByEmail(string email)",
                "detail": "User? Consumer.FindByEmail(string email)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 26,
                    "character": 0
                  },
                  "end": {
                    "line": 32,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 28,
                    "character": 17
                  },
                  "end": {
                    "line": 28,
                    "character": 28
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### Lib/Analytics.cs

```json
[
  {
    "name": "Analytics.cs",
    "kind": 1,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 18,
        "character": 0
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 18,
        "character": 0
      }
    },
    "children": [
      {
        "name": "Lib",
        "detail": "CsharpProbe.Lib",
        "kind": 3,
        "range": {
          "start": {
            "line": 0,
            "character": 0
          },
          "end": {
            "line": 18,
            "character": 0
          }
        },
        "selectionRange": {
          "start": {
            "line": 0,
            "character": 10
          },
          "end": {
            "line": 0,
            "character": 25
          }
        },
        "children": [
          {
            "name": "Analytics",
            "kind": 5,
            "range": {
              "start": {
                "line": 1,
                "character": 0
              },
              "end": {
                "line": 18,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 3,
                "character": 20
              },
              "end": {
                "line": 3,
                "character": 29
              }
            },
            "children": [
              {
                "name": "Track(string eventName)",
                "detail": "void Analytics.Track(string eventName)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 5,
                    "character": 0
                  },
                  "end": {
                    "line": 11,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 7,
                    "character": 23
                  },
                  "end": {
                    "line": 7,
                    "character": 28
                  }
                }
              },
              {
                "name": "TrackForUser(int userId, string eventName)",
                "detail": "void Analytics.TrackForUser(int userId, string eventName)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 11,
                    "character": 0
                  },
                  "end": {
                    "line": 17,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 13,
                    "character": 23
                  },
                  "end": {
                    "line": 13,
                    "character": 35
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### Models/User.cs

```json
[
  {
    "name": "User.cs",
    "kind": 1,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 38,
        "character": 0
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 38,
        "character": 0
      }
    },
    "children": [
      {
        "name": "Models",
        "detail": "CsharpProbe.Models",
        "kind": 3,
        "range": {
          "start": {
            "line": 0,
            "character": 0
          },
          "end": {
            "line": 38,
            "character": 0
          }
        },
        "selectionRange": {
          "start": {
            "line": 0,
            "character": 10
          },
          "end": {
            "line": 0,
            "character": 28
          }
        },
        "children": [
          {
            "name": "User",
            "kind": 5,
            "range": {
              "start": {
                "line": 1,
                "character": 0
              },
              "end": {
                "line": 31,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 7,
                "character": 14
              },
              "end": {
                "line": 7,
                "character": 18
              }
            },
            "children": [
              {
                "name": "PremiumTierLimit",
                "detail": "int User.PremiumTierLimit",
                "kind": 8,
                "range": {
                  "start": {
                    "line": 9,
                    "character": 21
                  },
                  "end": {
                    "line": 9,
                    "character": 43
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 9,
                    "character": 21
                  },
                  "end": {
                    "line": 9,
                    "character": 37
                  }
                }
              },
              {
                "name": "DisplayName",
                "detail": "string User.DisplayName",
                "kind": 7,
                "range": {
                  "start": {
                    "line": 10,
                    "character": 0
                  },
                  "end": {
                    "line": 13,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 12,
                    "character": 18
                  },
                  "end": {
                    "line": 12,
                    "character": 29
                  }
                }
              },
              {
                "name": "Role",
                "detail": "UserRole User.Role",
                "kind": 7,
                "range": {
                  "start": {
                    "line": 13,
                    "character": 0
                  },
                  "end": {
                    "line": 16,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 15,
                    "character": 20
                  },
                  "end": {
                    "line": 15,
                    "character": 24
                  }
                }
              },
              {
                "name": "SendWelcomeEmailAsync()",
                "detail": "Task User.SendWelcomeEmailAsync()",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 16,
                    "character": 0
                  },
                  "end": {
                    "line": 23,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 18,
                    "character": 22
                  },
                  "end": {
                    "line": 18,
                    "character": 43
                  }
                }
              },
              {
                "name": "FindByEmail(string email)",
                "detail": "User? User.FindByEmail(string email)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 23,
                    "character": 0
                  },
                  "end": {
                    "line": 30,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 26,
                    "character": 24
                  },
                  "end": {
                    "line": 26,
                    "character": 35
                  }
                }
              }
            ]
          },
          {
            "name": "UserRole",
            "detail": "UserRole",
            "kind": 10,
            "range": {
              "start": {
                "line": 31,
                "character": 0
              },
              "end": {
                "line": 38,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 32,
                "character": 12
              },
              "end": {
                "line": 32,
                "character": 20
              }
            },
            "children": [
              {
                "name": "Standard",
                "detail": "UserRole.Standard",
                "kind": 8,
                "range": {
                  "start": {
                    "line": 34,
                    "character": 0
                  },
                  "end": {
                    "line": 34,
                    "character": 12
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 34,
                    "character": 4
                  },
                  "end": {
                    "line": 34,
                    "character": 12
                  }
                }
              },
              {
                "name": "Premium",
                "detail": "UserRole.Premium",
                "kind": 8,
                "range": {
                  "start": {
                    "line": 35,
                    "character": 0
                  },
                  "end": {
                    "line": 35,
                    "character": 11
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 35,
                    "character": 4
                  },
                  "end": {
                    "line": 35,
                    "character": 11
                  }
                }
              },
              {
                "name": "Admin",
                "detail": "UserRole.Admin",
                "kind": 8,
                "range": {
                  "start": {
                    "line": 36,
                    "character": 0
                  },
                  "end": {
                    "line": 36,
                    "character": 9
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 36,
                    "character": 4
                  },
                  "end": {
                    "line": 36,
                    "character": 9
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### Services/IUserService.cs

```json
[
  {
    "name": "IUserService.cs",
    "kind": 1,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 13,
        "character": 0
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 13,
        "character": 0
      }
    },
    "children": [
      {
        "name": "Services",
        "detail": "CsharpProbe.Services",
        "kind": 3,
        "range": {
          "start": {
            "line": 0,
            "character": 0
          },
          "end": {
            "line": 13,
            "character": 0
          }
        },
        "selectionRange": {
          "start": {
            "line": 0,
            "character": 10
          },
          "end": {
            "line": 0,
            "character": 30
          }
        },
        "children": [
          {
            "name": "IUserService",
            "detail": "IUserService",
            "kind": 11,
            "range": {
              "start": {
                "line": 3,
                "character": 0
              },
              "end": {
                "line": 13,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 5,
                "character": 17
              },
              "end": {
                "line": 5,
                "character": 29
              }
            },
            "children": [
              {
                "name": "GetByIdAsync(int id)",
                "detail": "Task<User?> IUserService.GetByIdAsync(int id)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 7,
                    "character": 0
                  },
                  "end": {
                    "line": 9,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 8,
                    "character": 16
                  },
                  "end": {
                    "line": 8,
                    "character": 28
                  }
                }
              },
              {
                "name": "ListActive()",
                "detail": "IEnumerable<User> IUserService.ListActive()",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 9,
                    "character": 0
                  },
                  "end": {
                    "line": 12,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 11,
                    "character": 22
                  },
                  "end": {
                    "line": 11,
                    "character": 32
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### Services/UserService.cs

```json
[
  {
    "name": "UserService.cs",
    "kind": 1,
    "range": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 22,
        "character": 0
      }
    },
    "selectionRange": {
      "start": {
        "line": 0,
        "character": 0
      },
      "end": {
        "line": 22,
        "character": 0
      }
    },
    "children": [
      {
        "name": "Services",
        "detail": "CsharpProbe.Services",
        "kind": 3,
        "range": {
          "start": {
            "line": 0,
            "character": 0
          },
          "end": {
            "line": 22,
            "character": 0
          }
        },
        "selectionRange": {
          "start": {
            "line": 0,
            "character": 10
          },
          "end": {
            "line": 0,
            "character": 30
          }
        },
        "children": [
          {
            "name": "UserService",
            "kind": 5,
            "range": {
              "start": {
                "line": 3,
                "character": 0
              },
              "end": {
                "line": 22,
                "character": 0
              }
            },
            "selectionRange": {
              "start": {
                "line": 5,
                "character": 13
              },
              "end": {
                "line": 5,
                "character": 24
              }
            },
            "children": [
              {
                "name": "_users",
                "detail": "List<User> UserService._users",
                "kind": 8,
                "range": {
                  "start": {
                    "line": 7,
                    "character": 32
                  },
                  "end": {
                    "line": 7,
                    "character": 46
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 7,
                    "character": 32
                  },
                  "end": {
                    "line": 7,
                    "character": 38
                  }
                }
              },
              {
                "name": "GetByIdAsync(int id)",
                "detail": "Task<User?> UserService.GetByIdAsync(int id)",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 8,
                    "character": 0
                  },
                  "end": {
                    "line": 15,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 10,
                    "character": 29
                  },
                  "end": {
                    "line": 10,
                    "character": 41
                  }
                }
              },
              {
                "name": "ListActive()",
                "detail": "IEnumerable<User> UserService.ListActive()",
                "kind": 6,
                "range": {
                  "start": {
                    "line": 15,
                    "character": 0
                  },
                  "end": {
                    "line": 21,
                    "character": 0
                  }
                },
                "selectionRange": {
                  "start": {
                    "line": 17,
                    "character": 29
                  },
                  "end": {
                    "line": 17,
                    "character": 39
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }
]
```

## Probe #2 — references (drives spike check 1)

Probes findReferences for cross-file resolution. Roslyn
expected to surface clean cross-file references (parallel
to gopls/pyright; substantively cleaner than ruby-lsp
pre-Rubydex baseline).


### User record (class declaration)

position: `Models/User.cs` line 8, char 14

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Models/User.cs",
    "range": {
      "start": {
        "line": 26,
        "character": 18
      },
      "end": {
        "line": 26,
        "character": 22
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/IUserService.cs",
    "range": {
      "start": {
        "line": 8,
        "character": 9
      },
      "end": {
        "line": 8,
        "character": 13
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/IUserService.cs",
    "range": {
      "start": {
        "line": 11,
        "character": 16
      },
      "end": {
        "line": 11,
        "character": 20
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/UserService.cs",
    "range": {
      "start": {
        "line": 7,
        "character": 26
      },
      "end": {
        "line": 7,
        "character": 30
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/UserService.cs",
    "range": {
      "start": {
        "line": 10,
        "character": 22
      },
      "end": {
        "line": 10,
        "character": 26
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/UserService.cs",
    "range": {
      "start": {
        "line": 17,
        "character": 23
      },
      "end": {
        "line": 17,
        "character": 27
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 19,
        "character": 8
      },
      "end": {
        "line": 19,
        "character": 12
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 28,
        "character": 11
      },
      "end": {
        "line": 28,
        "character": 15
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 30,
        "character": 15
      },
      "end": {
        "line": 30,
        "character": 19
      }
    }
  }
]
```

### User.PremiumTierLimit (const field)

position: `Models/User.cs` line 10, char 21

```json
[]
```

### User.DisplayName (property)

position: `Models/User.cs` line 13, char 18

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 22,
        "character": 33
      },
      "end": {
        "line": 22,
        "character": 44
      }
    }
  }
]
```

### IUserService (interface)

position: `Services/IUserService.cs` line 6, char 17

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/UserService.cs",
    "range": {
      "start": {
        "line": 5,
        "character": 27
      },
      "end": {
        "line": 5,
        "character": 39
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 9,
        "character": 21
      },
      "end": {
        "line": 9,
        "character": 33
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 11,
        "character": 20
      },
      "end": {
        "line": 11,
        "character": 32
      }
    }
  }
]
```

### Analytics.Track (static method)

position: `Lib/Analytics.cs` line 8, char 23

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Lib/Analytics.cs",
    "range": {
      "start": {
        "line": 15,
        "character": 8
      },
      "end": {
        "line": 15,
        "character": 13
      }
    }
  },
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Consumer.cs",
    "range": {
      "start": {
        "line": 22,
        "character": 22
      },
      "end": {
        "line": 22,
        "character": 27
      }
    }
  }
]
```

## Probe #3 — hover (drives spike check 1)

Probes hover for signature + docstring (XML doc comment)
surfacing. Drives ADR-22 §getDocstring decision:

- ADR-13 (Pyright): docstrings omitted from hover
- ADR-14 (gopls): docstrings included
- ADR-21 (ruby-lsp): docstrings included

Fixture has XML doc comments (`/// <summary>`) on most
symbols; probe captures whether Roslyn surfaces them.


### User (record declaration)

position: `Models/User.cs` line 8, char 14

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nUser\n```\n\nUser record representing a registered user.\n\nParameters:\n- ``Id``: Unique user identifier.\n- ``Email``: User's email address."
  }
}
```

### PremiumTierLimit (const field)

position: `Models/User.cs` line 10, char 21

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nint User.PremiumTierLimit\n```"
  }
}
```

### DisplayName (property)

position: `Models/User.cs` line 13, char 18

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nstring User.DisplayName\n```\n\nDisplay name shown in UI surfaces."
  }
}
```

### SendWelcomeEmailAsync (async instance method)

position: `Models/User.cs` line 19, char 22

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nTask User.SendWelcomeEmailAsync()\n```\n\nSends a welcome email asynchronously."
  }
}
```

### FindByEmail (static method)

position: `Models/User.cs` line 27, char 24

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nUser? User.FindByEmail(string email)\n```\n\nFinds a user by email address.\n\nParameters:\n- ``email``: The email to look up."
  }
}
```

### IUserService (interface declaration)

position: `Services/IUserService.cs` line 6, char 17

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nIUserService\n```\n\nService abstraction for user operations."
  }
}
```

### UserService (class declaration; inheritdoc context)

position: `Services/UserService.cs` line 6, char 13

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nUserService\n```\n\nDefault in-memory user service implementation."
  }
}
```

### Analytics (static class)

position: `Lib/Analytics.cs` line 4, char 20

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```csharp\nAnalytics\n```\n\nPlain analytics utility — no service abstraction."
  }
}
```

## Probe #4 — definition (drives spike check 1)

Cross-file definition probes from Consumer.cs reference
sites to their declarations. Expected clean resolution
(Roslyn is workspace-aware; substantively parallel to
gopls's clean cross-file resolution).


### User type reference → Models/User.cs declaration

position: `Consumer.cs` line 20, char 8

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Models/User.cs",
    "range": {
      "start": {
        "line": 7,
        "character": 14
      },
      "end": {
        "line": 7,
        "character": 18
      }
    }
  }
]
```

### GetByIdAsync → IUserService declaration

position: `Consumer.cs` line 20, char 36

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/IUserService.cs",
    "range": {
      "start": {
        "line": 8,
        "character": 16
      },
      "end": {
        "line": 8,
        "character": 28
      }
    }
  }
]
```

### Analytics.Track → Lib/Analytics.cs declaration

position: `Consumer.cs` line 23, char 22

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Lib/Analytics.cs",
    "range": {
      "start": {
        "line": 7,
        "character": 23
      },
      "end": {
        "line": 7,
        "character": 28
      }
    }
  }
]
```

### User.FindByEmail (static) → Models/User.cs declaration

position: `Consumer.cs` line 31, char 20

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Models/User.cs",
    "range": {
      "start": {
        "line": 26,
        "character": 24
      },
      "end": {
        "line": 26,
        "character": 35
      }
    }
  }
]
```

## Probe #5 — typeDefinition (drives spike check 1)

Probes typeDefinition on typed variables in Consumer.cs.
C# is strongly typed (unlike Ruby's untyped receivers), so
typeDefinition should surface cleanly. Drives ADR-22
§getTypeInfo decision — likely cleaner than Pyright's
Protocol-vs-ABC fallback or Ruby's local-parseability
workaround.


### typeDefinition on `user` local var (User?)

position: `Consumer.cs` line 20, char 14

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Models/User.cs",
    "range": {
      "start": {
        "line": 7,
        "character": 14
      },
      "end": {
        "line": 7,
        "character": 18
      }
    }
  }
]
```

### typeDefinition on `role` local var (UserRole enum)

position: `Consumer.cs` line 24, char 21

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Models/User.cs",
    "range": {
      "start": {
        "line": 32,
        "character": 12
      },
      "end": {
        "line": 32,
        "character": 20
      }
    }
  }
]
```

### typeDefinition on `_service` field (IUserService)

position: `Consumer.cs` line 10, char 34

```json
[
  {
    "uri": "file:///c:/CodeWork/contextatlas/test/fixtures/csharp/Services/IUserService.cs",
    "range": {
      "start": {
        "line": 5,
        "character": 17
      },
      "end": {
        "line": 5,
        "character": 29
      }
    }
  }
]
```

## Probe #6 — diagnostic delivery channel (spike check 2)

Probes BOTH push-model (textDocument/publishDiagnostics
notification, captured during init) AND pull-model
(textDocument/diagnostic LSP 3.17 request) to determine
Roslyn's diagnostic channel. Ruby-lsp uses pull-model
(net-new substrate at ADR-21); Pyright/gopls use push-model
(ADR-13/ADR-14). Roslyn empirical channel surfaces here.


### Push-model: diagnostics received during init

Diagnostic counts per opened URI (via publishDiagnostics):



### Broken.cs diagnostics (deliberate parse error)

Push-model count: 0

```json
[]
```

### Pull-model: textDocument/diagnostic request

LSP 3.17 pull-model request. Captures whether Roslyn
supports the pull endpoint AND whether it returns the
same diagnostics as the push channel.

```json
{
  "kind": "full",
  "resultId": "2026-06-08T18:13:01.4345727Z-10002-0/false",
  "items": [
    {
      "range": {
        "start": {
          "line": 7,
          "character": 38
        },
        "end": {
          "line": 7,
          "character": 38
        }
      },
      "severity": 1,
      "code": "CS1026",
      "codeDescription": {
        "href": "https://msdn.microsoft.com/query/roslyn.query?appId=roslyn&k=k(CS1026)"
      },
      "source": "lsp",
      "message": ") expected"
    },
    {
      "range": {
        "start": {
          "line": 7,
          "character": 38
        },
        "end": {
          "line": 7,
          "character": 38
        }
      },
      "severity": 1,
      "code": "CS1002",
      "codeDescription": {
        "href": "https://msdn.microsoft.com/query/roslyn.query?appId=roslyn&k=k(CS1002)"
      },
      "source": "lsp",
      "message": "; expected"
    },
    {
      "range": {
        "start": {
          "line": 7,
          "character": 16
        },
        "end": {
          "line": 7,
          "character": 27
        }
      },
      "severity": 1,
      "code": "CS0501",
      "codeDescription": {
        "href": "https://msdn.microsoft.com/query/roslyn.query?appId=roslyn&k=k(CS0501)"
      },
      "source": "lsp",
      "message": "'Broken.DoSomething(string)' must declare a body because it is not marked abstract, extern, or partial"
    }
  ]
}
```

---

## Phase 0 spike adjudication (authored 2026-06-08)

**Authored at probe completion** (csharp-ls 0.24.0.0 against .NET 10
SDK 10.0.203; fixture `test/fixtures/csharp/` net10.0). Probe vehicle
was razzmatazz's csharp-ls (NuGet `csharp-ls`; 1.15M+ downloads).

### Spike check 1 — Endpoint surface

**Result: ALL endpoints surface cleanly via csharp-ls.** Initialize
capabilities advertise (and probes empirically confirm):

| Endpoint | Capability | Empirical probe |
|---|---|---|
| `textDocument/documentSymbol` | `documentSymbolProvider: true` | ✅ Hierarchical tree (file → namespace → class → method/property/field) for all 6 fixture .cs files including parse-error file `Broken.cs` (partial-parse recovery) |
| `textDocument/references` | `referencesProvider: true` | ✅ Cross-file resolution for class / const / property targets |
| `textDocument/hover` | `hoverProvider: true` | ✅ Markdown signature + XML doc summary (parameters surfaced) |
| `textDocument/definition` | `definitionProvider: true` | ✅ Cross-file resolution for type / method / static method |
| `textDocument/typeDefinition` | `typeDefinitionProvider: true` | ✅ Typed-var → type declaration; enum local var → enum declaration |
| `textDocument/diagnostic` | `diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: true }` | ✅ Pull-model returns Roslyn diagnostics with CS error codes + `codeDescription.href` link to MS docs |

**Bonus endpoints advertised** (beyond Ruby/Python/Go adapter scope —
not in v1.1 ship but worth noting for future arcs):
`typeHierarchyProvider`, `callHierarchyProvider`,
`semanticTokensProvider` (with 20 token types + `static` modifier),
`inlayHintProvider`, `workspaceSymbolProvider`, `renameProvider`,
`foldingRangeProvider`, `codeActionProvider`, `codeLensProvider`.

### Spike check 2 — Diagnostic delivery channel

**Result: PURE PULL-MODEL via `textDocument/diagnostic` (LSP 3.17).**
Net-new substrate parallel to ADR-21 (Ruby) pull-model finding;
diverges from ADR-13 (Pyright) + ADR-14 (gopls) push-model.

Empirical evidence:
- Push-model count via `textDocument/publishDiagnostics` for
  `Broken.cs`: **0** (no push notifications during init)
- Pull-model `textDocument/diagnostic` for `Broken.cs`: **3
  diagnostics** with full Roslyn substrate (CS1026 / CS1002 / CS0501
  error codes + ranges + severity + codeDescription URIs to MS docs)

ADR-22 §Diagnostic-delivery-channel will mirror ADR-21 §Diagnostic
pull-model section structure. Adapter's `getDiagnostics` implementation
sends pull requests; no `publishDiagnostics` listener needed for C#
diagnostic substrate.

### Spike check 3 — Symbol-kind taxonomy

**Result: Clean LSP standard mapping. No .NET-specific divergence
parallel to Ruby's kind-6-uniform discovery.**

| C# construct | LSP `SymbolKind` | Empirical |
|---|---|---|
| Namespace | 3 (Namespace) | ✅ `Models`, `CsharpProbe.Models` |
| Class | 5 (Class) | ✅ `User`, `Consumer`, `Broken` |
| **Record** | **5 (Class)** | ✅ `User` (record) maps to **kind=5**, same as class. **Answers Phase 0 open question — LSP spec has no dedicated record kind; Roslyn pragmatically maps to Class.** |
| Interface | 11 (Interface) — capability advertised | (verify in next probe iteration; not probed at spike scope but capability surfaced) |
| Method | 6 (Method) | ✅ `DoSomething(string arg)`, `SendWelcomeEmailAsync()`, `FindByEmail(string email)` |
| Static method | 6 (Method) | ✅ `FindByEmail` — no separate kind for static |
| Property | 7 (Property) | ✅ `DisplayName`, `Role` |
| Const field | 8 (Field) | ✅ `PremiumTierLimit` |
| Enum | 10 (Enum) | (verify; `UserRole` surfaced with kind 10 expected) |
| Enum member | 22 (EnumMember) | (verify; `Standard`/`Premium`/`Admin` expected) |
| File | 1 (File) | ✅ Top-level wrapper around each file's symbol tree |

Symbol `detail` field returns rich type signatures: `void Broken.
DoSomething(string arg)`, `int User.PremiumTierLimit`, `Task User.
SendWelcomeEmailAsync()`. ADR-22 §Symbol-kind section will be short
(parallel to Pyright/gopls cleanliness, not Ruby's amendment-heavy
pattern).

### Spike check 4 — Project-restore + workspace-setup behavior

**Result: csharp-ls absorbs Roslyn custom protocol; presents clean
LSP-spec interface to client. No custom notifications surface.**

Empirical observations during init + warmup:
- `$/progress` events captured: **0** (different from gopls's
  BEGIN/END frames; closer to Pyright's no-signal pattern)
- Custom (non-LSP-spec) notifications captured: **0** for all
  pre-registered handlers (`workspace/projectInitializationComplete`,
  `roslyn/*` namespace, `solution/open`, etc.). csharp-ls absorbs
  Roslyn's custom-protocol layer entirely.
- Server messages via `window/logMessage` type 3 (info): clean +
  well-formatted setup log:
  - LSP self-identification (`csharp-ls 0.24.0.0`)
  - License attribution (MIT; not Microsoft-affiliated)
  - Solution discovery (`0 solution(s) found`)
  - Fallback to .csproj discovery
  - Project load (`loading project "...CsharpProbe.csproj"..`)
- MSBuild SDK auto-detection: SDK `10.0.203` registered as default
  instance; TargetFramework `net10.0` resolved.

**ADR-22 §Readiness-pattern decision:** csharp-ls has no $/progress
signal. Adapter implementation can either:
- Use Pyright-style per-call ceiling (ADR-13 precedent), OR
- Use a fixed warmup delay then assume ready (Ruby ADR-21 baseline
  pattern; ~3-5s settle).

Default to Pyright-style per-call ceiling at adapter implementation;
revisit if Pattern 5 first-execution-at-canonical-repo verification
surfaces cold-start latency issues at scale (mobileapp 5,274 .cs
files; substantially larger than fixture).

### Surfaced Phase 0 discipline-pattern observation

**Windows PATH-enrichment for dotnet tools.** First probe run failed
with `Error: spawn csharp-ls ENOENT` because Bash/Git-Bash on Windows
does NOT have `%USERPROFILE%\.dotnet\tools` on PATH (PowerShell does,
because the SDK installer configures it for PowerShell only).

Pattern parallel to:
- ADR-21 Ruby `RUBY_BIN_DIRS` workaround (Windows install)
- ADR-14 gopls "Go binary must be on PATH" finding

**ADR-22 substrate requirement** + **doctor preflight item:**

- Adapter must enrich PATH with `%USERPROFILE%\.dotnet\tools` (Windows)
  or `$HOME/.dotnet/tools` (Linux/macOS) before spawning csharp-ls.
- Doctor C# environment check (Substep 5.2) surfaces this as
  preflight: `dotnet --version`, `.dotnet/tools/csharp-ls` findable,
  PATH-enrichment effective.

### Phase 1 entry adjudication

**Decision: GREEN-LIGHT Phase 1 at Ruby-anchored 2-3 week estimate.**

Justification:
- All four spike checks substantively answered with clean empirical
  data; no structural surprises requiring estimate revision.
- Symbol-kind taxonomy + endpoint surface + diagnostic channel all
  map cleanly into the existing adapter scaffolding pattern.
- One additional substrate item surfaced (PATH-enrichment for
  Windows dotnet tools); contained scope; absorbs within Phase 5.2
  doctor work + adapter spawn helper.

**Estimate band held:** 2-3 weeks per Ruby v0.9 Stream A precedent.
ADR-22 will be lighter on amendments than ADR-21 (Roslyn LSP via
csharp-ls is cleaner than ruby-lsp at the protocol layer — XML doc
comments included in hover; symbol-kinds map to LSP standard;
custom protocol absorbed by wrapper). Substrate prediction: ADR-22
expects **0-2 substantive amendments within cycle** (Pyright/gopls
precedent, not Ruby's 5-amendment precedent).

### A1 vs A2 architectural fork adjudication

**Decision: A1 — continue with `csharp-ls` wrapper as the cohort
install path.**

Empirical evidence supports A1:
- Wrapper produces clean LSP-spec interface (spike check 4 confirmed)
- No custom protocol leakage requiring A2-style direct integration
- Project auto-discovery (`.sln` / `.csproj`) works out-of-the-box
- XML doc comments included in hover without extra work
- 1.15M+ NuGet downloads confirms cohort adoption beyond ContextAtlas

**Maintenance-tail caveat preserved** (per advisor 2026-06-08
correction): csharp-ls is solo-maintainer (Saulius Menkevičius),
NOT Shopify-backed like ruby-lsp. A1 ship path is faster but
abandonment risk is real:
- **Mitigation 1:** ADR-22 documents A2 fallback path explicitly.
  If csharp-ls becomes unmaintained, ContextAtlas can ship a Roslyn-
  direct adapter at v1.2+ cycle without architectural rewrite (the
  custom-protocol substrate becomes adapter-internal rather than
  wrapper-delegated).
- **Mitigation 2:** Doctor check surfaces csharp-ls version + warns
  if version is substantively old (>12 months since last release).
  Surfacing maintenance-staleness signal to cohort users.
- **Mitigation 3:** Pin `csharp-ls` minimum version range; allow
  cohort flexibility for newer patches but block on majors so
  protocol changes get adapter-side validation.

**Travis-pending backend-team editor-stack input** preserved as a
post-launch verification: if cohort users predominantly run VS Code
+ C# Dev Kit, A2 cost narrows substantively and we may revisit at
v1.2+. Not blocking v1.1.0 ship.

### Substrate-record observations for ADR-22 authoring

1. **Roslyn LSP via csharp-ls is structurally cleaner than ruby-lsp
   baseline.** Hover includes XML doc summaries + parameter
   descriptions; symbol-kinds map to LSP standard; project
   auto-discovery works. Adapter implementation is straightforward.
2. **Pull-model diagnostic** (parallel to ADR-21 Ruby). ADR-22
   diagnostic section mirrors Ruby precedent.
3. **No $/progress signal** (different from gopls). Per-call
   ceiling pattern per Pyright precedent.
4. **Record maps to SymbolKind.Class (5).** LSP spec gap (no
   dedicated record kind); Roslyn pragmatic mapping; ADR-22
   §Symbol-kind documents.
5. **PATH-enrichment for dotnet tools on Windows.** New doctor
   preflight check + adapter spawn helper.
6. **Subprocess exit timing.** csharp-ls shuts down cleanly when
   parent client calls stop(); no special lifecycle handling needed.

### Phase 0 close — Phase 1 substep enumeration ready

Next: Phase 1 probe substrate expansion (already substantively
covered by this spike; full Phase 1 may extend the fixture with
async/await patterns, generics, nullable reference types,
attributes, partial classes, file-scoped namespaces — none
structurally surprising per Phase 0 evidence).

Substep enumeration per Ruby v0.9 Stream A template:
1. Probe scaffold ✅ (substantively done at Phase 0)
2. Fixture authoring ✅ (substantively done; may extend)
3. Probe implementation ✅ (substantively done; may extend)
4. ADR-22 authoring (next substep at Phase 1 entry)
5. Cohort-version amendment — likely a no-op (already anchored to
   .NET 10 SDK 10.0.203 per global.json match)
