# gopls probe findings

Raw behavior capture from gopls v0.21.1 against a diverse Go
fixture + cobra sanity pass. Produced by `scripts/gopls-probe.ts`
on 2026-04-24T20:25:15.320Z.

Purpose: ground ADR-14's LSP primitive mappings in observed behavior.

**Version pin note.** gopls v0.21.1 is the current stable release
(Feb 2026) backing Go 1.26.2. An earlier proposal of v0.16.2 would
have been incompatible with Go 1.26 — gopls's "only latest Go"
build support policy means pins must track the Go toolchain
closely. ADR-14 should document v0.21.1 as the probe-tested version
and call out the version-compatibility gotcha.

## Boot — fixture

- Gopls binary: `C:\Users\Travis\go\bin\gopls.exe` (on PATH)
- Fixture: `C:\CodeWork\contextatlas\test\fixtures\go`
- .go files: 5
  - `consumer.go`
  - `kinds.go`
  - `platform_other.go`
  - `platform_windows.go`
  - `impl.go`

### initialize response (trimmed to capabilities)

```json
{
  "textDocumentSync": {
    "openClose": true,
    "change": 2,
    "save": {}
  },
  "completionProvider": {
    "triggerCharacters": [
      "."
    ]
  },
  "hoverProvider": true,
  "signatureHelpProvider": {
    "triggerCharacters": [
      "(",
      ","
    ],
    "retriggerCharacters": [
      ")"
    ]
  },
  "definitionProvider": true,
  "typeDefinitionProvider": true,
  "implementationProvider": true,
  "referencesProvider": true,
  "documentHighlightProvider": true,
  "documentSymbolProvider": true,
  "codeActionProvider": true,
  "codeLensProvider": {},
  "documentLinkProvider": {},
  "workspaceSymbolProvider": true,
  "documentFormattingProvider": true,
  "renameProvider": true,
  "foldingRangeProvider": true,
  "selectionRangeProvider": true,
  "executeCommandProvider": {
    "commands": [
      "gopls.add_dependency",
      "gopls.add_import",
      "gopls.add_telemetry_counters",
      "gopls.add_test",
      "gopls.apply_fix",
      "gopls.assembly",
      "gopls.change_signature",
      "gopls.check_upgrades",
      "gopls.client_open_url",
      "gopls.diagnose_files",
      "gopls.doc",
      "gopls.edit_go_directive",
      "gopls.extract_to_new_file",
      "gopls.fetch_vulncheck_result",
      "gopls.free_symbols",
      "gopls.gc_details",
      "gopls.generate",
      "gopls.go_get_package",
      "gopls.lsp",
      "gopls.list_imports",
      "gopls.list_known_packages",
      "gopls.maybe_prompt_for_telemetry",
      "gopls.mem_stats",
      "gopls.modify_tags",
      "gopls.modules",
      "gopls.move_type",
      "gopls.package_symbols",
      "gopls.packages",
      "gopls.regenerate_cgo",
      "gopls.remove_dependency",
      "gopls.reset_go_mod_diagnostics",
      "gopls.run_go_work_command",
      "gopls.run_govulncheck",
      "gopls.run_tests",
      "gopls.scan_imports",
      "gopls.split_package",
      "gopls.start_debugging",
      "gopls.start_profile",
      "gopls.stop_profile",
      "gopls.tidy",
      "gopls.update_go_sum",
      "gopls.upgrade_dependency",
      "gopls.vendor",
      "gopls.views",
      "gopls.vulncheck",
      "gopls.workspace_stats"
    ]
  },
  "callHierarchyProvider": true,
  "semanticTokensProvider": {
    "legend": {
      "tokenTypes": [
        "namespace",
        "type",
        "typeParameter",
        "parameter",
        "variable",
        "function",
        "method",
        "macro",
        "keyword",
        "comment",
        "string",
        "number",
        "operator",
        "label"
      ],
      "tokenModifiers": [
        "definition",
        "readonly",
        "defaultLibrary",
        "array",
        "bool",
        "chan",
        "format",
        "interface",
        "map",
        "number",
        "pointer",
        "signature",
        "slice",
        "string",
        "struct"
      ]
    },
    "range": true,
    "full": true
  },
  "typeHierarchyProvider": true,
  "inlayHintProvider": {},
  "workspace": {
    "workspaceFolders": {
      "supported": true,
      "changeNotifications": "workspace/didChangeWorkspaceFolders"
    },
    "fileOperations": {
      "didCreate": {
        "filters": [
          {
            "scheme": "file",
            "pattern": {
              "glob": "**/*.go"
            }
          }
        ]
      }
    }
  }
}
```

### serverInfo

```json
{
  "name": "gopls",
  "version": "{\"GoVersion\":\"go1.26.2\",\"Path\":\"golang.org/x/tools/gopls\",\"Main\":{\"Path\":\"golang.org/x/tools/gopls\",\"Version\":\"v0.21.1\",\"Sum\":\"h1:1/o9z5Brdero4jFm9Jr46Uwj8GU9lQdoSXHMlwRHb/w=\"},\"Deps\":[{\"Path\":\"github.com/BurntSushi/toml\",\"Version\":\"v1.5.0\",\"Sum\":\"h1:W5quZX/G/csjUnuI8SUYlsHs9M38FC7znL0lIO+DvMg=\"},{\"Path\":\"github.com/fatih/camelcase\",\"Version\":\"v1.0.0\",\"Sum\":\"h1:hxNvNX/xYBp0ovncs8WyWZrOrpBNub/JfaMvbURyft8=\"},{\"Path\":\"github.com/fatih/gomodifytags\",\"Version\":\"v1.17.1-0.20250423142747-f3939df9aa3c\",\"Sum\":\"h1:dDSgAjoOMp8da3egfz0t2S+t8RGOpEmEXZubcGuc0Bg=\"},{\"Path\":\"github.com/fatih/structtag\",\"Version\":\"v1.2.0\",\"Sum\":\"h1:/OdNE99OxoI/PqaW/SuSK9uxxT3f/tcSZgon/ssNSx4=\"},{\"Path\":\"github.com/fsnotify/fsnotify\",\"Version\":\"v1.9.0\",\"Sum\":\"h1:2Ml+OJNzbYCTzsxtv8vKSFD9PbJjmhYF14k/jKC7S9k=\"},{\"Path\":\"github.com/google/go-cmp\",\"Version\":\"v0.7.0\",\"Sum\":\"h1:wk8382ETsv4JYUZwIsn6YpYiWiBsYLSJiTsyBybVuN8=\"},{\"Path\":\"github.com/google/jsonschema-go\",\"Version\":\"v0.3.0\",\"Sum\":\"h1:6AH2TxVNtk3IlvkkhjrtbUc4S8AvO0Xii0DxIygDg+Q=\"},{\"Path\":\"github.com/modelcontextprotocol/go-sdk\",\"Version\":\"v0.8.0\",\"Sum\":\"h1:jdsBtGzBLY287WKSIjYovOXAqtJkP+HtFQFKrZd4a6c=\"},{\"Path\":\"github.com/yosida95/uritemplate/v3\",\"Version\":\"v3.0.2\",\"Sum\":\"h1:Ed3Oyj9yrmi9087+NczuL5BwkIc4wvTb5zIM+UJPGz4=\"},{\"Path\":\"golang.org/x/exp/typeparams\",\"Version\":\"v0.0.0-20251023183803-a4bb9ffd2546\",\"Sum\":\"h1:HDjDiATsGqvuqvkDvgJjD1IgPrVekcSXVVE21JwvzGE=\"},{\"Path\":\"golang.org/x/mod\",\"Version\":\"v0.30.0\",\"Sum\":\"h1:fDEXFVZ/fmCKProc/yAXXUijritrDzahmwwefnjoPFk=\"},{\"Path\":\"golang.org/x/sync\",\"Version\":\"v0.18.0\",\"Sum\":\"h1:kr88TuHDroi+UVf+0hZnirlk8o8T+4MrK6mr60WkH/I=\"},{\"Path\":\"golang.org/x/sys\",\"Version\":\"v0.38.0\",\"Sum\":\"h1:3yZWxaJjBmCWXqhN1qh02AkOnCQ1poK6oF+a7xWL6Gc=\"},{\"Path\":\"golang.org/x/telemetry\",\"Version\":\"v0.0.0-20251111182119-bc8e575c7b54\",\"Sum\":\"h1:E2/AqCUMZGgd73TQkxUMcMla25GB9i/5HOdLr+uH7Vo=\"},{\"Path\":\"golang.org/x/text\",\"Version\":\"v0.31.0\",\"Sum\":\"h1:aC8ghyu4JhP8VojJ2lEHBnochRno1sgL6nEi9WGFGMM=\"},{\"Path\":\"golang.org/x/tools\",\"Version\":\"v0.39.1-0.20260109155911-b69ac100ecb7\",\"Sum\":\"h1:UaaZx92hw3fDa9xRcX2//NBRE3sR4VHQLlt0TkN2geY=\"},{\"Path\":\"golang.org/x/vuln\",\"Version\":\"v1.1.4\",\"Sum\":\"h1:Ju8QsuyhX3Hk8ma3CesTbO8vfJD9EvUBgHvkxHBzj0I=\"},{\"Path\":\"honnef.co/go/tools\",\"Version\":\"v0.7.0-0.dev.0.20251022135355-8273271481d0\",\"Sum\":\"h1:5SXjd4ET5dYijLaf0O3aOenC0Z4ZafIWSpjUzsQaNho=\"},{\"Path\":\"mvdan.cc/gofumpt\",\"Version\":\"v0.8.0\",\"Sum\":\"h1:nZUCeC2ViFaerTcYKstMmfysj6uhQrA2vJe+2vwGU6k=\"},{\"Path\":\"mvdan.cc/xurls/v2\",\"Version\":\"v2.6.0\",\"Sum\":\"h1:3NTZpeTxYVWNSokW3MKeyVkz/j7uYXYiMtXRUfmjbgI=\"}],\"Settings\":[{\"Key\":\"-buildmode\",\"Value\":\"exe\"},{\"Key\":\"-compiler\",\"Value\":\"gc\"},{\"Key\":\"DefaultGODEBUG\",\"Value\":\"cryptocustomrand=1,tlssecpmlkem=0,urlstrictcolons=0\"},{\"Key\":\"CGO_ENABLED\",\"Value\":\"0\"},{\"Key\":\"GOARCH\",\"Value\":\"amd64\"},{\"Key\":\"GOOS\",\"Value\":\"windows\"},{\"Key\":\"GOAMD64\",\"Value\":\"v1\"}],\"Version\":\"v0.21.1\"}"
}
```

## T7 — Workspace warmup (diagnostics after didOpen)

Does gopls publish diagnostics for opened files without further trigger?

- `consumer.go`: 0 diagnostic(s)
- `kinds.go`: 0 diagnostic(s)
- `platform_other.go`: 0 diagnostic(s)
- `impl.go`: 0 diagnostic(s)
- `platform_windows.go`: 0 diagnostic(s)

_Fixture is intentionally clean — any non-zero count indicates gopls flagged something we need to understand._

## T3 — documentSymbol (kinds.go)

Captures the full symbol tree gopls returns for the pathology
fixture — covers structs, interfaces, methods (both receiver
kinds), generics, type aliases vs type definitions, iota const
blocks, and exported vs unexported names.
```json
[
  {
    "name": "DefaultTimeout",
    "kind": 14,
    "range": {
      "start": {
        "line": 18,
        "character": 6
      },
      "end": {
        "line": 18,
        "character": 25
      }
    },
    "selectionRange": {
      "start": {
        "line": 18,
        "character": 6
      },
      "end": {
        "line": 18,
        "character": 20
      }
    }
  },
  {
    "name": "maxRetries",
    "kind": 14,
    "range": {
      "start": {
        "line": 21,
        "character": 6
      },
      "end": {
        "line": 21,
        "character": 20
      }
    },
    "selectionRange": {
      "start": {
        "line": 21,
        "character": 6
      },
      "end": {
        "line": 21,
        "character": 16
      }
    }
  },
  {
    "name": "StatusReady",
    "kind": 14,
    "range": {
      "start": {
        "line": 25,
        "character": 1
      },
      "end": {
        "line": 25,
        "character": 19
      }
    },
    "selectionRange": {
      "start": {
        "line": 25,
        "character": 1
      },
      "end": {
        "line": 25,
        "character": 12
      }
    }
  },
  {
    "name": "StatusRunning",
    "kind": 14,
    "range": {
      "start": {
        "line": 26,
        "character": 1
      },
      "end": {
        "line": 26,
        "character": 14
      }
    },
    "selectionRange": {
      "start": {
        "line": 26,
        "character": 1
      },
      "end": {
        "line": 26,
        "character": 14
      }
    }
  },
  {
    "name": "StatusDone",
    "kind": 14,
    "range": {
      "start": {
        "line": 27,
        "character": 1
      },
      "end": {
        "line": 27,
        "character": 11
      }
    },
    "selectionRange": {
      "start": {
        "line": 27,
        "character": 1
      },
      "end": {
        "line": 27,
        "character": 11
      }
    }
  },
  {
    "name": "DefaultRenderer",
    "detail": "Renderer",
    "kind": 13,
    "range": {
      "start": {
        "line": 35,
        "character": 4
      },
      "end": {
        "line": 35,
        "character": 47
      }
    },
    "selectionRange": {
      "start": {
        "line": 35,
        "character": 4
      },
      "end": {
        "line": 35,
        "character": 19
      }
    }
  },
  {
    "name": "logger",
    "detail": "io.Writer",
    "kind": 13,
    "range": {
      "start": {
        "line": 38,
        "character": 4
      },
      "end": {
        "line": 38,
        "character": 20
      }
    },
    "selectionRange": {
      "start": {
        "line": 38,
        "character": 4
      },
      "end": {
        "line": 38,
        "character": 10
      }
    }
  },
  {
    "name": "UserID",
    "detail": "int64",
    "kind": 5,
    "range": {
      "start": {
        "line": 45,
        "character": 5
      },
      "end": {
        "line": 45,
        "character": 17
      }
    },
    "selectionRange": {
      "start": {
        "line": 45,
        "character": 5
      },
      "end": {
        "line": 45,
        "character": 11
      }
    }
  },
  {
    "name": "NodeID",
    "detail": "UserID",
    "kind": 5,
    "range": {
      "start": {
        "line": 48,
        "character": 5
      },
      "end": {
        "line": 48,
        "character": 20
      }
    },
    "selectionRange": {
      "start": {
        "line": 48,
        "character": 5
      },
      "end": {
        "line": 48,
        "character": 11
      }
    }
  },
  {
    "name": "Shape",
    "detail": "interface{...}",
    "kind": 11,
    "range": {
      "start": {
        "line": 55,
        "character": 5
      },
      "end": {
        "line": 58,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 55,
        "character": 5
      },
      "end": {
        "line": 55,
        "character": 10
      }
    },
    "children": [
      {
        "name": "Area",
        "detail": "func() float64",
        "kind": 6,
        "range": {
          "start": {
            "line": 56,
            "character": 1
          },
          "end": {
            "line": 56,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 56,
            "character": 1
          },
          "end": {
            "line": 56,
            "character": 5
          }
        }
      },
      {
        "name": "Perimeter",
        "detail": "func() float64",
        "kind": 6,
        "range": {
          "start": {
            "line": 57,
            "character": 1
          },
          "end": {
            "line": 57,
            "character": 20
          }
        },
        "selectionRange": {
          "start": {
            "line": 57,
            "character": 1
          },
          "end": {
            "line": 57,
            "character": 10
          }
        }
      }
    ]
  },
  {
    "name": "Renderer",
    "detail": "interface{...}",
    "kind": 11,
    "range": {
      "start": {
        "line": 61,
        "character": 5
      },
      "end": {
        "line": 64,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 61,
        "character": 5
      },
      "end": {
        "line": 61,
        "character": 13
      }
    },
    "children": [
      {
        "name": "Shape",
        "detail": "Shape",
        "kind": 8,
        "range": {
          "start": {
            "line": 62,
            "character": 1
          },
          "end": {
            "line": 62,
            "character": 6
          }
        },
        "selectionRange": {
          "start": {
            "line": 62,
            "character": 1
          },
          "end": {
            "line": 62,
            "character": 6
          }
        }
      },
      {
        "name": "Render",
        "detail": "func() string",
        "kind": 6,
        "range": {
          "start": {
            "line": 63,
            "character": 1
          },
          "end": {
            "line": 63,
            "character": 16
          }
        },
        "selectionRange": {
          "start": {
            "line": 63,
            "character": 1
          },
          "end": {
            "line": 63,
            "character": 7
          }
        }
      }
    ]
  },
  {
    "name": "Rectangle",
    "detail": "struct{...}",
    "kind": 23,
    "range": {
      "start": {
        "line": 71,
        "character": 5
      },
      "end": {
        "line": 75,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 71,
        "character": 5
      },
      "end": {
        "line": 71,
        "character": 14
      }
    },
    "children": [
      {
        "name": "Width",
        "detail": "float64",
        "kind": 8,
        "range": {
          "start": {
            "line": 72,
            "character": 1
          },
          "end": {
            "line": 72,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 72,
            "character": 1
          },
          "end": {
            "line": 72,
            "character": 6
          }
        }
      },
      {
        "name": "Height",
        "detail": "float64",
        "kind": 8,
        "range": {
          "start": {
            "line": 73,
            "character": 1
          },
          "end": {
            "line": 73,
            "character": 15
          }
        },
        "selectionRange": {
          "start": {
            "line": 73,
            "character": 1
          },
          "end": {
            "line": 73,
            "character": 7
          }
        }
      },
      {
        "name": "name",
        "detail": "string",
        "kind": 8,
        "range": {
          "start": {
            "line": 74,
            "character": 1
          },
          "end": {
            "line": 74,
            "character": 14
          }
        },
        "selectionRange": {
          "start": {
            "line": 74,
            "character": 1
          },
          "end": {
            "line": 74,
            "character": 5
          }
        }
      }
    ]
  },
  {
    "name": "Square",
    "detail": "struct{...}",
    "kind": 23,
    "range": {
      "start": {
        "line": 78,
        "character": 5
      },
      "end": {
        "line": 81,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 78,
        "character": 5
      },
      "end": {
        "line": 78,
        "character": 11
      }
    },
    "children": [
      {
        "name": "Rectangle",
        "detail": "Rectangle",
        "kind": 8,
        "range": {
          "start": {
            "line": 79,
            "character": 1
          },
          "end": {
            "line": 79,
            "character": 10
          }
        },
        "selectionRange": {
          "start": {
            "line": 79,
            "character": 1
          },
          "end": {
            "line": 79,
            "character": 10
          }
        }
      },
      {
        "name": "corner",
        "detail": "string",
        "kind": 8,
        "range": {
          "start": {
            "line": 80,
            "character": 1
          },
          "end": {
            "line": 80,
            "character": 14
          }
        },
        "selectionRange": {
          "start": {
            "line": 80,
            "character": 1
          },
          "end": {
            "line": 80,
            "character": 7
          }
        }
      }
    ]
  },
  {
    "name": "(*Rectangle).Area",
    "detail": "func() float64",
    "kind": 6,
    "range": {
      "start": {
        "line": 84,
        "character": 0
      },
      "end": {
        "line": 86,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 84,
        "character": 20
      },
      "end": {
        "line": 84,
        "character": 24
      }
    }
  },
  {
    "name": "(Rectangle).Perimeter",
    "detail": "func() float64",
    "kind": 6,
    "range": {
      "start": {
        "line": 89,
        "character": 0
      },
      "end": {
        "line": 91,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 89,
        "character": 19
      },
      "end": {
        "line": 89,
        "character": 28
      }
    }
  },
  {
    "name": "(*Square).Render",
    "detail": "func() string",
    "kind": 6,
    "range": {
      "start": {
        "line": 94,
        "character": 0
      },
      "end": {
        "line": 96,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 94,
        "character": 17
      },
      "end": {
        "line": 94,
        "character": 23
      }
    }
  },
  {
    "name": "ShapeRenderer",
    "detail": "struct{}",
    "kind": 23,
    "range": {
      "start": {
        "line": 99,
        "character": 5
      },
      "end": {
        "line": 99,
        "character": 27
      }
    },
    "selectionRange": {
      "start": {
        "line": 99,
        "character": 5
      },
      "end": {
        "line": 99,
        "character": 18
      }
    }
  },
  {
    "name": "(*ShapeRenderer).Area",
    "detail": "func() float64",
    "kind": 6,
    "range": {
      "start": {
        "line": 101,
        "character": 0
      },
      "end": {
        "line": 103,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 101,
        "character": 25
      },
      "end": {
        "line": 101,
        "character": 29
      }
    }
  },
  {
    "name": "(*ShapeRenderer).Perimeter",
    "detail": "func() float64",
    "kind": 6,
    "range": {
      "start": {
        "line": 105,
        "character": 0
      },
      "end": {
        "line": 107,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 105,
        "character": 25
      },
      "end": {
        "line": 105,
        "character": 34
      }
    }
  },
  {
    "name": "(*ShapeRenderer).Render",
    "detail": "func() string",
    "kind": 6,
    "range": {
      "start": {
        "line": 109,
        "character": 0
      },
      "end": {
        "line": 111,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 109,
        "character": 25
      },
      "end": {
        "line": 109,
        "character": 31
      }
    }
  },
  {
    "name": "Stack",
    "detail": "struct{...}",
    "kind": 23,
    "range": {
      "start": {
        "line": 118,
        "character": 5
      },
      "end": {
        "line": 120,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 118,
        "character": 5
      },
      "end": {
        "line": 118,
        "character": 10
      }
    },
    "children": [
      {
        "name": "items",
        "detail": "[]T",
        "kind": 8,
        "range": {
          "start": {
            "line": 119,
            "character": 1
          },
          "end": {
            "line": 119,
            "character": 10
          }
        },
        "selectionRange": {
          "start": {
            "line": 119,
            "character": 1
          },
          "end": {
            "line": 119,
            "character": 6
          }
        }
      }
    ]
  },
  {
    "name": "(*Stack[T]).Push",
    "detail": "func(item T)",
    "kind": 6,
    "range": {
      "start": {
        "line": 123,
        "character": 0
      },
      "end": {
        "line": 125,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 123,
        "character": 19
      },
      "end": {
        "line": 123,
        "character": 23
      }
    }
  },
  {
    "name": "(*Stack[T]).Pop",
    "detail": "func() (T, bool)",
    "kind": 6,
    "range": {
      "start": {
        "line": 128,
        "character": 0
      },
      "end": {
        "line": 137,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 128,
        "character": 19
      },
      "end": {
        "line": 128,
        "character": 22
      }
    }
  },
  {
    "name": "Map",
    "detail": "func(items []T, fn func(T) U) []U",
    "kind": 12,
    "range": {
      "start": {
        "line": 140,
        "character": 0
      },
      "end": {
        "line": 146,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 140,
        "character": 5
      },
      "end": {
        "line": 140,
        "character": 8
      }
    }
  },
  {
    "name": "Sum",
    "detail": "func(items []T) T",
    "kind": 12,
    "range": {
      "start": {
        "line": 149,
        "character": 0
      },
      "end": {
        "line": 155,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 149,
        "character": 5
      },
      "end": {
        "line": 149,
        "character": 8
      }
    }
  },
  {
    "name": "NewRectangle",
    "detail": "func(w, h float64) *Rectangle",
    "kind": 12,
    "range": {
      "start": {
        "line": 162,
        "character": 0
      },
      "end": {
        "line": 164,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 162,
        "character": 5
      },
      "end": {
        "line": 162,
        "character": 17
      }
    }
  },
  {
    "name": "normalize",
    "detail": "func(v float64) float64",
    "kind": 12,
    "range": {
      "start": {
        "line": 167,
        "character": 0
      },
      "end": {
        "line": 172,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 167,
        "character": 5
      },
      "end": {
        "line": 167,
        "character": 14
      }
    }
  }
]
```

## T3b — documentSymbol on build-tagged files

Do `//go:build` constraints hide symbols from documentSymbol on
the non-matching platform? Probe is running on Windows, so
`platform_windows.go` should be 'active' and `platform_other.go`
should be excluded — but documentSymbol is a per-file
request, so gopls may still return symbols for the inactive file.

### platform_windows.go

```json
[
  {
    "name": "platformName",
    "kind": 14,
    "range": {
      "start": {
        "line": 4,
        "character": 6
      },
      "end": {
        "line": 4,
        "character": 30
      }
    },
    "selectionRange": {
      "start": {
        "line": 4,
        "character": 6
      },
      "end": {
        "line": 4,
        "character": 18
      }
    }
  },
  {
    "name": "platformGreeting",
    "detail": "func() string",
    "kind": 12,
    "range": {
      "start": {
        "line": 6,
        "character": 0
      },
      "end": {
        "line": 8,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 6,
        "character": 5
      },
      "end": {
        "line": 6,
        "character": 21
      }
    }
  }
]
```

### platform_other.go

```json
[
  {
    "name": "platformName",
    "kind": 14,
    "range": {
      "start": {
        "line": 4,
        "character": 6
      },
      "end": {
        "line": 4,
        "character": 28
      }
    },
    "selectionRange": {
      "start": {
        "line": 4,
        "character": 6
      },
      "end": {
        "line": 4,
        "character": 18
      }
    }
  },
  {
    "name": "platformGreeting",
    "detail": "func() string",
    "kind": 12,
    "range": {
      "start": {
        "line": 6,
        "character": 0
      },
      "end": {
        "line": 8,
        "character": 1
      }
    },
    "selectionRange": {
      "start": {
        "line": 6,
        "character": 5
      },
      "end": {
        "line": 6,
        "character": 21
      }
    }
  }
]
```

## T4 — hover output samples

Each target's `needle` is a phrase locating the line; `identifier` is the specific name hover should land on.

### interface Shape

position: line 55, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype Shape interface { // size=16 (0x10)\n\tArea() float64\n\tPerimeter() float64\n}\n```\n\n---\n\nShape is a simple interface.\n\n\n---\n\n[`kinds.Shape` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Shape)"
  },
  "range": {
    "start": {
      "line": 55,
      "character": 5
    },
    "end": {
      "line": 55,
      "character": 10
    }
  }
}
```

### interface Renderer (embeds Shape)

position: line 61, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype Renderer interface { // size=16 (0x10)\n\tShape\n\tRender() string\n}\n```\n\n---\n\nRenderer embeds Shape — interface embedding pathology.\n\n\n```go\nfunc (Shape) Area() float64\nfunc (Shape) Perimeter() float64\n```\n\n---\n\n[`kinds.Renderer` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Renderer)"
  },
  "range": {
    "start": {
      "line": 61,
      "character": 5
    },
    "end": {
      "line": 61,
      "character": 13
    }
  }
}
```

### struct Rectangle

position: line 71, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype Rectangle struct { // size=32 (0x20)\n\tWidth  float64\n\tHeight float64\n\tname   string // unexported\n}\n```\n\n---\n\nRectangle has exported and unexported fields.\n\n\n```go\nfunc (r *Rectangle) Area() float64\nfunc (r Rectangle) Perimeter() float64\n```\n\n---\n\n[`kinds.Rectangle` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Rectangle)"
  },
  "range": {
    "start": {
      "line": 71,
      "character": 5
    },
    "end": {
      "line": 71,
      "character": 14
    }
  }
}
```

### struct Square (embeds Rectangle)

position: line 78, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype Square struct { // size=48 (0x30)\n\tRectangle\n\tcorner string\n}\n```\n\n---\n\nSquare embeds Rectangle (anonymous field).\n\n\n```go\n// Embedded fields:\nWidth  float64 // through Rectangle \nHeight float64 // through Rectangle \nname   string  // through Rectangle \n```\n\n```go\nfunc (r *Rectangle) Area() float64\nfunc (r Rectangle) Perimeter() float64\nfunc (s *Square) Render() string\n```\n\n---\n\n[`kinds.Square` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Square)"
  },
  "range": {
    "start": {
      "line": 78,
      "character": 5
    },
    "end": {
      "line": 78,
      "character": 11
    }
  }
}
```

### method Area (pointer receiver)

position: line 84, char 20

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nfunc (r *Rectangle) Area() float64\n```\n\n---\n\nArea is a pointer-receiver method.\n\n\n---\n\n[`(kinds.Rectangle).Area` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Rectangle.Area)"
  },
  "range": {
    "start": {
      "line": 84,
      "character": 20
    },
    "end": {
      "line": 84,
      "character": 24
    }
  }
}
```

### method Perimeter (value receiver)

position: line 89, char 19

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nfunc (r Rectangle) Perimeter() float64\n```\n\n---\n\nPerimeter is a value-receiver method.\n\n\n---\n\n[`(kinds.Rectangle).Perimeter` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Rectangle.Perimeter)"
  },
  "range": {
    "start": {
      "line": 89,
      "character": 19
    },
    "end": {
      "line": 89,
      "character": 28
    }
  }
}
```

### type definition UserID

position: line 45, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype UserID int64 // size=8\n```\n\n---\n\nUserID is a distinct type (type definition).\n\n\n---\n\n[`kinds.UserID` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#UserID)"
  },
  "range": {
    "start": {
      "line": 45,
      "character": 5
    },
    "end": {
      "line": 45,
      "character": 11
    }
  }
}
```

### type alias NodeID

position: line 48, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype NodeID = UserID // size=8\n\ntype UserID int64\n```\n\n---\n\nNodeID is a type alias (same underlying type).\n\n\n---\n\n[`kinds.NodeID` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#NodeID)"
  },
  "range": {
    "start": {
      "line": 48,
      "character": 5
    },
    "end": {
      "line": 48,
      "character": 11
    }
  }
}
```

### generic type Stack

position: line 118, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\ntype Stack[T any] struct {\n\titems []T\n}\n```\n\n---\n\nStack is a generic type with a single type parameter.\n\n\n```go\nfunc (s *Stack[T]) Pop() (T, bool)\nfunc (s *Stack[T]) Push(item T)\n```\n\n---\n\n[`kinds.Stack` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Stack)"
  },
  "range": {
    "start": {
      "line": 118,
      "character": 5
    },
    "end": {
      "line": 118,
      "character": 10
    }
  }
}
```

### method on generic receiver

position: line 123, char 19

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nfunc (s *Stack[T]) Push(item T)\n```\n\n---\n\nPush is a method on a generic receiver.\n\n\n---\n\n[`(kinds.Stack).Push` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Stack.Push)"
  },
  "range": {
    "start": {
      "line": 123,
      "character": 19
    },
    "end": {
      "line": 123,
      "character": 23
    }
  }
}
```

### generic function Map

position: line 140, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nfunc Map[T, U any](items []T, fn func(T) U) []U\n```\n\n---\n\nMap is a generic function with two type parameters.\n\n\n---\n\n[`kinds.Map` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Map)"
  },
  "range": {
    "start": {
      "line": 140,
      "character": 5
    },
    "end": {
      "line": 140,
      "character": 8
    }
  }
}
```

### generic function Sum (union constraint)

position: line 149, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nfunc Sum[T int | float64](items []T) T\n```\n\n---\n\nSum is a generic function with a union constraint.\n\n\n---\n\n[`kinds.Sum` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#Sum)"
  },
  "range": {
    "start": {
      "line": 149,
      "character": 5
    },
    "end": {
      "line": 149,
      "character": 8
    }
  }
}
```

### exported const

position: line 18, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nconst DefaultTimeout untyped int = 30\n```\n\n---\n\nDefaultTimeout is an exported plain const.\n\n\n---\n\n[`kinds.DefaultTimeout` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#DefaultTimeout)"
  },
  "range": {
    "start": {
      "line": 18,
      "character": 6
    },
    "end": {
      "line": 18,
      "character": 20
    }
  }
}
```

### unexported const

position: line 21, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nconst maxRetries untyped int = 3\n```\n\n---\n\nmaxRetries is unexported — case-sensitivity boundary.\n"
  },
  "range": {
    "start": {
      "line": 21,
      "character": 6
    },
    "end": {
      "line": 21,
      "character": 16
    }
  }
}
```

### iota const (first)

position: line 25, char 1

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nconst StatusReady untyped int = iota // 0\n```\n\n---\n\nConst block with iota.\n\n\n---\n\n[`kinds.StatusReady` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#StatusReady)"
  },
  "range": {
    "start": {
      "line": 25,
      "character": 1
    },
    "end": {
      "line": 25,
      "character": 12
    }
  }
}
```

### iota const (implicit)

position: line 26, char 1

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```go\nconst StatusRunning untyped int = 1\n```\n\n---\n\nConst block with iota.\n\n\n---\n\n[`kinds.StatusRunning` on pkg.go.dev](https://pkg.go.dev/contextatlas/probe/fixtures/kinds#StatusRunning)"
  },
  "range": {
    "start": {
      "line": 26,
      "character": 1
    },
    "end": {
      "line": 26,
      "character": 14
    }
  }
}
```

## T0 — textDocument/definition

Per ADR-13, definition grounds findReferences. For Go, expected behavior:
definition on a *reference site* jumps to the declaration. Probe from consumer.go.

### NewRectangle usage → kinds.go declaration

position: line 7, char 6

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 162,
        "character": 5
      },
      "end": {
        "line": 162,
        "character": 17
      }
    }
  }
]
```

### generic Map usage → kinds.go declaration

position: line 22, char 8

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 140,
        "character": 5
      },
      "end": {
        "line": 140,
        "character": 8
      }
    }
  }
]
```

### generic Stack usage → kinds.go declaration

position: line 16, char 9

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 118,
        "character": 5
      },
      "end": {
        "line": 118,
        "character": 10
      }
    }
  }
]
```

## T2 — references (cross-file)


### NewRectangle

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/consumer.go",
    "range": {
      "start": {
        "line": 7,
        "character": 6
      },
      "end": {
        "line": 7,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/consumer.go",
    "range": {
      "start": {
        "line": 27,
        "character": 6
      },
      "end": {
        "line": 27,
        "character": 18
      }
    }
  }
]
```

### Rectangle

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 79,
        "character": 1
      },
      "end": {
        "line": 79,
        "character": 10
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 84,
        "character": 9
      },
      "end": {
        "line": 84,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 89,
        "character": 8
      },
      "end": {
        "line": 89,
        "character": 17
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 162,
        "character": 33
      },
      "end": {
        "line": 162,
        "character": 42
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 163,
        "character": 9
      },
      "end": {
        "line": 163,
        "character": 18
      }
    }
  }
]
```

### Stack (generic)

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/consumer.go",
    "range": {
      "start": {
        "line": 15,
        "character": 21
      },
      "end": {
        "line": 15,
        "character": 26
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/consumer.go",
    "range": {
      "start": {
        "line": 16,
        "character": 9
      },
      "end": {
        "line": 16,
        "character": 14
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 123,
        "character": 9
      },
      "end": {
        "line": 123,
        "character": 14
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 128,
        "character": 9
      },
      "end": {
        "line": 128,
        "character": 14
      }
    }
  }
]
```

### Map (generic)

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/consumer.go",
    "range": {
      "start": {
        "line": 22,
        "character": 8
      },
      "end": {
        "line": 22,
        "character": 11
      }
    }
  }
]
```

## T1 — implementation (interface → implementers, and reverse)

Go interfaces are satisfied implicitly. Does gopls return Rectangle + ShapeRenderer as implementers of Shape? Does it return Shape + Renderer as interfaces satisfied by Rectangle?

### Shape (interface → implementers)

position: line 55, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 61,
        "character": 5
      },
      "end": {
        "line": 61,
        "character": 13
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 71,
        "character": 5
      },
      "end": {
        "line": 71,
        "character": 14
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 78,
        "character": 5
      },
      "end": {
        "line": 78,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 99,
        "character": 5
      },
      "end": {
        "line": 99,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/renderer/impl.go",
    "range": {
      "start": {
        "line": 8,
        "character": 5
      },
      "end": {
        "line": 8,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/renderer/impl.go",
    "range": {
      "start": {
        "line": 26,
        "character": 5
      },
      "end": {
        "line": 26,
        "character": 18
      }
    }
  }
]
```

### Renderer (interface → implementers)

position: line 61, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 78,
        "character": 5
      },
      "end": {
        "line": 78,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 99,
        "character": 5
      },
      "end": {
        "line": 99,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/renderer/impl.go",
    "range": {
      "start": {
        "line": 26,
        "character": 5
      },
      "end": {
        "line": 26,
        "character": 18
      }
    }
  }
]
```

### Rectangle (concrete → interfaces satisfied)

position: line 71, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 55,
        "character": 5
      },
      "end": {
        "line": 55,
        "character": 10
      }
    }
  }
]
```

### ShapeRenderer (concrete → interfaces satisfied)

position: line 99, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 55,
        "character": 5
      },
      "end": {
        "line": 55,
        "character": 10
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 61,
        "character": 5
      },
      "end": {
        "line": 61,
        "character": 13
      }
    }
  }
]
```

## T1b — implementation (cross-package)

Extends T1: re-queries implementation on `kinds.Shape` and `kinds.Renderer` now that the subpackage `renderer/impl.go` is loaded in the workspace. Verifies gopls indexes implementers across package boundaries — the pattern real codebases need.

Expected: Shape implementers now include `renderer.Circle` and `renderer.FancyRenderer` (via compile-time `var _ kinds.Shape = (*Circle)(nil)` witnesses); Renderer implementers include `renderer.FancyRenderer`.

### Shape (now with renderer/ loaded)

position: line 55, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 61,
        "character": 5
      },
      "end": {
        "line": 61,
        "character": 13
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 71,
        "character": 5
      },
      "end": {
        "line": 71,
        "character": 14
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 78,
        "character": 5
      },
      "end": {
        "line": 78,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 99,
        "character": 5
      },
      "end": {
        "line": 99,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/renderer/impl.go",
    "range": {
      "start": {
        "line": 8,
        "character": 5
      },
      "end": {
        "line": 8,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/renderer/impl.go",
    "range": {
      "start": {
        "line": 26,
        "character": 5
      },
      "end": {
        "line": 26,
        "character": 18
      }
    }
  }
]
```

### Renderer (now with renderer/ loaded)

position: line 61, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 78,
        "character": 5
      },
      "end": {
        "line": 78,
        "character": 11
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 99,
        "character": 5
      },
      "end": {
        "line": 99,
        "character": 18
      }
    }
  },
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/renderer/impl.go",
    "range": {
      "start": {
        "line": 26,
        "character": 5
      },
      "end": {
        "line": 26,
        "character": 18
      }
    }
  }
]
```

## Bonus — textDocument/typeDefinition


### r (local var via generic inference)

position: line 7, char 1

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 71,
        "character": 5
      },
      "end": {
        "line": 71,
        "character": 14
      }
    }
  }
]
```

### NodeID (alias)

position: line 48, char 5

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 48,
        "character": 5
      },
      "end": {
        "line": 48,
        "character": 11
      }
    }
  }
]
```

### DefaultRenderer (interface-typed var)

position: line 35, char 4

```json
[
  {
    "uri": "file:///C:/CodeWork/contextatlas/test/fixtures/go/kinds.go",
    "range": {
      "start": {
        "line": 61,
        "character": 5
      },
      "end": {
        "line": 61,
        "character": 13
      }
    }
  }
]
```

---

## Cobra sanity check

Boot gopls against `C:\CodeWork\cobra` (19 source files, go.mod at root).
Confirms gopls handles a real module correctly — module resolution,
dependency loading, and documentSymbol on a 2000+ LOC file.

### initialize response (serverInfo only)

```json
{
  "name": "gopls",
  "version": "{\"GoVersion\":\"go1.26.2\",\"Path\":\"golang.org/x/tools/gopls\",\"Main\":{\"Path\":\"golang.org/x/tools/gopls\",\"Version\":\"v0.21.1\",\"Sum\":\"h1:1/o9z5Brdero4jFm9Jr46Uwj8GU9lQdoSXHMlwRHb/w=\"},\"Deps\":[{\"Path\":\"github.com/BurntSushi/toml\",\"Version\":\"v1.5.0\",\"Sum\":\"h1:W5quZX/G/csjUnuI8SUYlsHs9M38FC7znL0lIO+DvMg=\"},{\"Path\":\"github.com/fatih/camelcase\",\"Version\":\"v1.0.0\",\"Sum\":\"h1:hxNvNX/xYBp0ovncs8WyWZrOrpBNub/JfaMvbURyft8=\"},{\"Path\":\"github.com/fatih/gomodifytags\",\"Version\":\"v1.17.1-0.20250423142747-f3939df9aa3c\",\"Sum\":\"h1:dDSgAjoOMp8da3egfz0t2S+t8RGOpEmEXZubcGuc0Bg=\"},{\"Path\":\"github.com/fatih/structtag\",\"Version\":\"v1.2.0\",\"Sum\":\"h1:/OdNE99OxoI/PqaW/SuSK9uxxT3f/tcSZgon/ssNSx4=\"},{\"Path\":\"github.com/fsnotify/fsnotify\",\"Version\":\"v1.9.0\",\"Sum\":\"h1:2Ml+OJNzbYCTzsxtv8vKSFD9PbJjmhYF14k/jKC7S9k=\"},{\"Path\":\"github.com/google/go-cmp\",\"Version\":\"v0.7.0\",\"Sum\":\"h1:wk8382ETsv4JYUZwIsn6YpYiWiBsYLSJiTsyBybVuN8=\"},{\"Path\":\"github.com/google/jsonschema-go\",\"Version\":\"v0.3.0\",\"Sum\":\"h1:6AH2TxVNtk3IlvkkhjrtbUc4S8AvO0Xii0DxIygDg+Q=\"},{\"Path\":\"github.com/modelcontextprotocol/go-sdk\",\"Version\":\"v0.8.0\",\"Sum\":\"h1:jdsBtGzBLY287WKSIjYovOXAqtJkP+HtFQFKrZd4a6c=\"},{\"Path\":\"github.com/yosida95/uritemplate/v3\",\"Version\":\"v3.0.2\",\"Sum\":\"h1:Ed3Oyj9yrmi9087+NczuL5BwkIc4wvTb5zIM+UJPGz4=\"},{\"Path\":\"golang.org/x/exp/typeparams\",\"Version\":\"v0.0.0-20251023183803-a4bb9ffd2546\",\"Sum\":\"h1:HDjDiATsGqvuqvkDvgJjD1IgPrVekcSXVVE21JwvzGE=\"},{\"Path\":\"golang.org/x/mod\",\"Version\":\"v0.30.0\",\"Sum\":\"h1:fDEXFVZ/fmCKProc/yAXXUijritrDzahmwwefnjoPFk=\"},{\"Path\":\"golang.org/x/sync\",\"Version\":\"v0.18.0\",\"Sum\":\"h1:kr88TuHDroi+UVf+0hZnirlk8o8T+4MrK6mr60WkH/I=\"},{\"Path\":\"golang.org/x/sys\",\"Version\":\"v0.38.0\",\"Sum\":\"h1:3yZWxaJjBmCWXqhN1qh02AkOnCQ1poK6oF+a7xWL6Gc=\"},{\"Path\":\"golang.org/x/telemetry\",\"Version\":\"v0.0.0-20251111182119-bc8e575c7b54\",\"Sum\":\"h1:E2/AqCUMZGgd73TQkxUMcMla25GB9i/5HOdLr+uH7Vo=\"},{\"Path\":\"golang.org/x/text\",\"Version\":\"v0.31.0\",\"Sum\":\"h1:aC8ghyu4JhP8VojJ2lEHBnochRno1sgL6nEi9WGFGMM=\"},{\"Path\":\"golang.org/x/tools\",\"Version\":\"v0.39.1-0.20260109155911-b69ac100ecb7\",\"Sum\":\"h1:UaaZx92hw3fDa9xRcX2//NBRE3sR4VHQLlt0TkN2geY=\"},{\"Path\":\"golang.org/x/vuln\",\"Version\":\"v1.1.4\",\"Sum\":\"h1:Ju8QsuyhX3Hk8ma3CesTbO8vfJD9EvUBgHvkxHBzj0I=\"},{\"Path\":\"honnef.co/go/tools\",\"Version\":\"v0.7.0-0.dev.0.20251022135355-8273271481d0\",\"Sum\":\"h1:5SXjd4ET5dYijLaf0O3aOenC0Z4ZafIWSpjUzsQaNho=\"},{\"Path\":\"mvdan.cc/gofumpt\",\"Version\":\"v0.8.0\",\"Sum\":\"h1:nZUCeC2ViFaerTcYKstMmfysj6uhQrA2vJe+2vwGU6k=\"},{\"Path\":\"mvdan.cc/xurls/v2\",\"Version\":\"v2.6.0\",\"Sum\":\"h1:3NTZpeTxYVWNSokW3MKeyVkz/j7uYXYiMtXRUfmjbgI=\"}],\"Settings\":[{\"Key\":\"-buildmode\",\"Value\":\"exe\"},{\"Key\":\"-compiler\",\"Value\":\"gc\"},{\"Key\":\"DefaultGODEBUG\",\"Value\":\"cryptocustomrand=1,tlssecpmlkem=0,urlstrictcolons=0\"},{\"Key\":\"CGO_ENABLED\",\"Value\":\"0\"},{\"Key\":\"GOARCH\",\"Value\":\"amd64\"},{\"Key\":\"GOOS\",\"Value\":\"windows\"},{\"Key\":\"GOAMD64\",\"Value\":\"v1\"}],\"Version\":\"v0.21.1\"}"
}
```

### diagnostics on command.go

count: 0

### documentSymbol count on command.go

top-level symbols: 142

First 5 with `name` + `kind` only (full capture would flood the doc):
```json
[
  {
    "name": "FlagSetByCobraAnnotation",
    "kind": 14
  },
  {
    "name": "CommandDisplayNameAnnotation",
    "kind": 14
  },
  {
    "name": "helpFlagName",
    "kind": 14
  },
  {
    "name": "helpCommandName",
    "kind": 14
  },
  {
    "name": "FParseErrWhitelist",
    "kind": 5
  }
]
```

### definition jump on pflag import usage

Probes whether gopls resolves symbols from `github.com/spf13/pflag` (a dep via go.sum).
_pflag.FlagSet reference not found in command.go_

_Probe limitation, not a gopls finding:_ the probe's `locate()` helper
searches for the literal string `"pflag.FlagSet"` and cobra's
command.go uses pflag via different syntax (the imported package is
renamed or accessed via method chains). Skipping this subtest doesn't
affect confidence in gopls's dep resolution — see the clean boot,
zero diagnostics, and 142-symbol parse of command.go above.

---

## Key observations

This section interprets the raw captures above. Each observation
lists the evidence section it draws from.

### 1. Gopls has two hard runtime requirements beyond "vanilla LSP"

Two probe infrastructure findings surfaced during tuning; both must
be handled by the adapter, not assumed.

**1a. `go` binary must be on the gopls process's PATH.** Evidence:
during probe iteration, spawning gopls in a shell lacking `go`
produced `"Error loading workspace folders (expected 1, got 0)"` +
every subsequent LSP request returned `"no views"`. Gopls spawns
`go` as a subprocess for module loading, dependency analysis, and
build-related operations. Fix in probe: prepend `C:\Program Files\Go\bin`
and `<USERPROFILE>\go\bin` to `process.env.PATH` before spawn.
Adapter responsibility: either ensure PATH propagation (document as
user requirement, parallel to tsserver's PATH requirement in
CLAUDE.md) or discover `go` location at initialization.

**1b. `workspace/configuration` handler must return a length-matched
array.** Evidence: pyright tolerates `null` as the response to
`workspace/configuration`; gopls does not — returning `null` causes
gopls to skip workspace view creation, producing the same `"no views"`
cascade. The LSP-spec-correct response is an array of the same length
as the request's `items[]`. For a probe using gopls defaults,
`items.map(() => ({}))` suffices. Adapter responsibility: implement
the handler; do not delegate to a generic null-stub.

### 2. LSP methods required for the adapter all work

| Method | Status | Adapter use |
|---|---|---|
| `textDocument/documentSymbol` | ✓ | `listSymbols` (hierarchical output) |
| `textDocument/hover` | ✓ | `getTypeInfo`, claim-extraction substrate |
| `textDocument/definition` | ✓ | grounds `findReferences` invariant per ADR-13 precedent |
| `textDocument/references` | ✓ | `findReferences` |
| `textDocument/typeDefinition` | ✓ | per ADR-07 type-info capability |
| `textDocument/implementation` | ✓ | interface-satisfaction — materially richer than pyright's fallback |
| `textDocument/publishDiagnostics` | ✓ | `getDiagnostics` |

No method returned "method not supported" or unexpectedly-shaped
data on the core adapter path. Evidence: T3, T4, T0, T2, T1, T1b,
Bonus sections, + T7 diagnostics.

### 3. SymbolKind mapping (for ADR-01 compliance)

Kinds observed in the fixture, ordered by numeric code:

| LSP Kind | Go construct | Observed locations |
|---:|---|---|
| 5 Class | type definition AND type alias | `UserID`, `NodeID` (T3); `detail` disambiguates |
| 6 Method | interface method + struct method | `Area`, `Perimeter`, `Render`, `Push`, `Pop` (T3) |
| 8 Field | struct fields, embedded struct fields, embedded interface entries | `Width`, `Height`, `name`, `Rectangle` (embedded in Square), `Shape` (embedded in Renderer) (T3) |
| 11 Interface | `type X interface {...}` | `Shape`, `Renderer` (T3) |
| 12 Function | top-level `func` | `Map`, `Sum`, `NewRectangle`, `normalize`, `platformGreeting` (T3, T3b) |
| 13 Variable | package-level `var` | `DefaultRenderer`, `logger` (T3) |
| 14 Constant | `const` (both plain and iota-defined) | `DefaultTimeout`, `maxRetries`, `StatusReady/Running/Done`, `platformName` (T3, T3b) |
| 23 Struct | `type X struct {...}` | `Rectangle`, `Square`, `ShapeRenderer`, `Stack` (T3) |

Type alias vs type definition both use kind 5; disambiguate via the
`detail` field (`"int64"` for `UserID`, `"UserID"` for `NodeID`) or
hover output (alias form includes `=` in the declaration text).

### 4. Struct methods are top-level symbols with receiver-encoded names

Evidence: T3. Gopls emits struct methods with names like:
- `(*Rectangle).Area` (pointer receiver)
- `(Rectangle).Perimeter` (value receiver)
- `(*Square).Render` (pointer receiver)
- `(*Stack[T]).Push` (pointer receiver, generic)
- `(*Stack[T]).Pop`

**NOT** nested as children of the struct. This is fundamentally
different from tsserver (class methods as children of the class)
and pyright (class methods as children of the class).

**SymbolId implication:** the receiver-encoded name is unique,
deterministic, and readable. `sym:go:kinds.go:(*Rectangle).Area`
is a valid ADR-01-conformant SymbolId. No adapter-side renaming
needed. The `sym:go:` prefix is the stable identity.

**Receiver-kind encoding:** the leading `*` before the receiver
type name distinguishes pointer-receiver from value-receiver
methods. Adapter can surface this as a flag on the Symbol record
or leave it embedded in the name.

**Generic receivers:** gopls writes `(*Stack[T]).Push` with the
literal type parameter name (`T`), not an instantiation. Adapter
treats this as-is; the `[T]` is part of the canonical method name.

### 5. Asymmetry: interface methods ARE children; struct methods are NOT

Evidence: T3. In the same documentSymbol response, interface
methods (Shape's Area/Perimeter; Renderer's Render) appear in
the interface's `children[]` array, while struct methods
(Rectangle's Area/Perimeter) appear as sibling top-level entries.

Pipeline implication: the symbol-ingestion layer must handle both
shapes. The cleanest normalization is to flatten the interface
method children to top-level (matching the struct-method layout),
or to walk both as declared. Either works; the adapter should
pick one and document it.

### 6. Iota const block members are flat top-level symbols

Evidence: T3. A `const (...)` block with iota produces three
separate top-level symbol entries — `StatusReady`, `StatusRunning`,
`StatusDone` — not nested under a block container.

Hover distinguishes the anchor from followers:
- `StatusReady`: `const StatusReady untyped int = iota // 0`
- `StatusRunning`: `const StatusRunning untyped int = 1` (evaluated)

Adapter can either surface the block membership via the shared
line range / leading comment, or flatten to three independent
constants. The probe favors flattening — simpler, matches gopls's
native shape, and iota is syntactic sugar rather than semantic
grouping.

### 7. Generics preserved in both signatures and symbol names

Evidence: T3 + T4. Everywhere the type parameter list appears in
source, gopls preserves it in both `name` and `detail`:
- `type Stack[T any] struct` (detail includes `[T any]`)
- `(*Stack[T]).Push` (name includes `[T]`)
- `func Map[T, U any](items []T, fn func(T) U) []U` (hover)
- `func Sum[T int | float64](items []T) T` (hover, union constraint)

No adapter-side reconstruction needed. Signatures are ready for
direct inclusion in the Symbol record's `signature` field per
ADR-01.

### 8. Hover output is rich and extraction-ready

Evidence: T4. Hover markdown includes:
- Full declaration with size annotation (`type Rectangle struct { // size=32 (0x20) ... }`)
- Preceding doc comment verbatim (the Go-standard `// Doc sentence.` form)
- For structs: summary of all methods with receiver kinds
  (`func (r *Rectangle) Area() float64`)
- For structs with embedded fields (Square): promoted fields
  annotated with origin (`// through Rectangle`) AND all methods
  from self + embedded types
- pkg.go.dev link (useful for ADR cross-linking in extraction)

Substantially richer than pyright's hover; at least on par with
tsserver. Strong substrate for claim extraction.

### 9. Implementation endpoint works symmetrically and cross-package

Evidence: T1 + T1b. Single-package (T1):
- `Shape` → `[Renderer, Rectangle, Square, ShapeRenderer]`
- `Rectangle` → `[Shape]` (Rectangle lacks `Render()`)
- `ShapeRenderer` → `[Shape, Renderer]`

Cross-package (T1b, after `renderer/impl.go` is loaded):
- `Shape` → same 4 same-package entries + `[Circle, FancyRenderer]`
  from `renderer/impl.go`
- `Renderer` → `[Square, ShapeRenderer, FancyRenderer]`

Both directions work (interface → implementers and concrete →
interfaces satisfied). The embedder of an interface (Renderer
embeds Shape) is itself listed as a Shape implementer.

**ADR-13 comparison:** pyright required an inventory-walk fallback
to find Protocol/ABC implementers. Gopls's implementation endpoint
works directly and handles both same-package and cross-package
cases. ADR-14 can specify direct use without fallback.

### 10. Build-tagged files: documentSymbol returns symbols regardless of active tag

Evidence: T3b. Probe ran on Windows (`//go:build windows` active).
documentSymbol on `platform_windows.go` returned `platformName` +
`platformGreeting`; documentSymbol on `platform_other.go`
(`//go:build !windows`) returned the SAME names for its own
definitions — both files surface their symbols via per-file
documentSymbol.

This is because documentSymbol is a text-level per-file request;
build-constraint evaluation happens at the package level (workspace
views). Adapter implication: when iterating files, symbols from
build-tagged alternates will appear, and the pipeline must decide
whether to:
- (a) surface both with disambiguating filenames (trivial, preserves
  all information),
- (b) dedup at the package level based on an active-build
  convention (complex, requires knowing which tags apply),
- (c) surface both as-is and let downstream consumers handle via
  file-path filters.

The probe recommends (a) for v0.1 Go adapter: preserve all
per-file symbol information. Build-target awareness is a downstream
concern beyond the adapter's scope.

### 11. Diagnostics clean on well-formed fixture + cobra

Evidence: T7 + Cobra sanity. The fixture reports 0 diagnostics
across all 5 files (kinds.go, consumer.go, platform_*.go,
renderer/impl.go). Cobra's command.go (2072 LOC) reports 0
diagnostics — the Go 1.15 module loads cleanly under Go 1.26.2 +
gopls v0.21.1. This rules out a version-compatibility issue
between older-module real-world targets and the pinned toolchain.

### 12. Module path + GOPATH quirks don't surface for the probe

Evidence: Cobra sanity. Gopls resolves cobra's module dependencies
(`github.com/spf13/pflag`, `github.com/cpuguy83/go-md2man/v2`,
etc.) from the module cache at `~/go/pkg/mod`. 0 diagnostics.
Workspace activation + package loading both complete within ~5s.

---

## ADR-14 decision block

**Path chosen: (b) workarounds required, no architectural gap.**

Two infrastructure requirements must be documented in ADR-14 and
implemented in the adapter:

1. **PATH propagation:** gopls process environment must include
   `go` binary. Implementation: document as user requirement
   parallel to tsserver's PATH stance (CLAUDE.md), OR adapter
   discovers `go` at init. Probe probed workable; defer to ADR-14
   for adapter choice.
2. **workspace/configuration handler:** length-matched empty-object
   array. Implementation: ~5 LOC in adapter init.

The following structural quirks are handled in the adapter's
mapping layer without protocol deviation:

- Struct-method top-level naming with receiver encoding (finding #4)
- Interface-method nesting vs struct-method flat layout (finding #5)
- Iota const flattening (finding #6)
- Build-tagged file symbol duplication (finding #10)

**ADR-03 amendment: NOT required.** The language-adapter plugin
interface fits gopls as-is. ADR-14 documents Go-specific mapping
choices in the same way ADR-13 documents Python-specific mapping
choices — additive, not revisionary.

**Step 9 (GoAdapter) unblocking:** no blockers identified. The
adapter can be built against this raw capture without re-probing.

