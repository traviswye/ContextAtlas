# Pyright probe findings

Raw behavior capture from Pyright 1.1.409 against a diverse
Python fixture. Produced by `scripts/pyright-probe.ts` on
2026-04-22T19:55:45.949Z.

Purpose: ground ADR-13's LSP primitive mappings in observed behavior.

## Boot

- Pyright entry: `C:\CodeWork\contextatlas\node_modules\pyright\langserver.index.js`
- Fixture: `C:\CodeWork\contextatlas\test\fixtures\pyright-probe`
- .py files: 4
  - `broken.py`
  - `consumer.py`
  - `sample.py`
  - `subclasses.py`

### initialize response (trimmed to capabilities)

```json
{
  "textDocumentSync": 2,
  "definitionProvider": {
    "workDoneProgress": true
  },
  "declarationProvider": {
    "workDoneProgress": true
  },
  "typeDefinitionProvider": {
    "workDoneProgress": true
  },
  "referencesProvider": {
    "workDoneProgress": true
  },
  "documentSymbolProvider": {
    "workDoneProgress": true
  },
  "workspaceSymbolProvider": {
    "workDoneProgress": true
  },
  "hoverProvider": {
    "workDoneProgress": true
  },
  "documentHighlightProvider": {
    "workDoneProgress": true
  },
  "renameProvider": {
    "prepareProvider": true,
    "workDoneProgress": true
  },
  "completionProvider": {
    "triggerCharacters": [
      ".",
      "[",
      "\"",
      "'"
    ],
    "resolveProvider": true,
    "workDoneProgress": true,
    "completionItem": {
      "labelDetailsSupport": true
    }
  },
  "signatureHelpProvider": {
    "triggerCharacters": [
      "(",
      ",",
      ")"
    ],
    "workDoneProgress": true
  },
  "codeActionProvider": {
    "codeActionKinds": [
      "quickfix",
      "source.organizeImports"
    ],
    "workDoneProgress": true
  },
  "executeCommandProvider": {
    "commands": [],
    "workDoneProgress": true
  },
  "callHierarchyProvider": true,
  "workspace": {
    "workspaceFolders": {
      "supported": true,
      "changeNotifications": true
    }
  }
}
```

## T7 — Workspace warmup (diagnostics after didOpen)

Pyright's behavior on didOpen: does it publish diagnostics for opened files without further trigger?

- `broken.py`: 2 diagnostic(s)
- `consumer.py`: 0 diagnostic(s)
- `sample.py`: 0 diagnostic(s)
- `subclasses.py`: 0 diagnostic(s)

## T6 — Diagnostics (broken.py)

broken.py reported 2 diagnostic(s):
```json
[
  {
    "range": {
      "start": {
        "line": 10,
        "character": 12
      },
      "end": {
        "line": 10,
        "character": 17
      }
    },
    "message": "Argument of type \"Literal['one']\" cannot be assigned to parameter \"a\" of type \"int\" in function \"add\"\n  \"Literal['one']\" is not assignable to \"int\"",
    "severity": 1,
    "code": "reportArgumentType",
    "source": "Pyright",
    "codeDescription": {
      "href": "https://github.com/microsoft/pyright/blob/main/docs/configuration.md#reportArgumentType"
    }
  },
  {
    "range": {
      "start": {
        "line": 18,
        "character": 0
      },
      "end": {
        "line": 18,
        "character": 11
      }
    },
    "message": "Argument missing for parameter \"value\"",
    "severity": 1,
    "code": "reportCallIssue",
    "source": "Pyright",
    "codeDescription": {
      "href": "https://github.com/microsoft/pyright/blob/main/docs/configuration.md#reportCallIssue"
    }
  }
]
```

## T3 — documentSymbol (sample.py)

```json
[
  {
    "name": "UserIdV1",
    "kind": 13,
    "range": {
      "start": {
        "line": 23,
        "character": 0
      },
      "end": {
        "line": 23,
        "character": 8
      }
    },
    "selectionRange": {
      "start": {
        "line": 23,
        "character": 0
      },
      "end": {
        "line": 23,
        "character": 8
      }
    },
    "children": []
  },
  {
    "name": "UserIdV2",
    "kind": 13,
    "range": {
      "start": {
        "line": 26,
        "character": 0
      },
      "end": {
        "line": 26,
        "character": 8
      }
    },
    "selectionRange": {
      "start": {
        "line": 26,
        "character": 0
      },
      "end": {
        "line": 26,
        "character": 8
      }
    },
    "children": []
  },
  {
    "name": "UserIdV3",
    "kind": 13,
    "range": {
      "start": {
        "line": 30,
        "character": 5
      },
      "end": {
        "line": 30,
        "character": 13
      }
    },
    "selectionRange": {
      "start": {
        "line": 30,
        "character": 5
      },
      "end": {
        "line": 30,
        "character": 13
      }
    },
    "children": []
  },
  {
    "name": "Shape",
    "kind": 5,
    "range": {
      "start": {
        "line": 36,
        "character": 0
      },
      "end": {
        "line": 41,
        "character": 33
      }
    },
    "selectionRange": {
      "start": {
        "line": 36,
        "character": 6
      },
      "end": {
        "line": 36,
        "character": 11
      }
    },
    "children": [
      {
        "name": "area",
        "kind": 6,
        "range": {
          "start": {
            "line": 40,
            "character": 4
          },
          "end": {
            "line": 41,
            "character": 33
          }
        },
        "selectionRange": {
          "start": {
            "line": 40,
            "character": 8
          },
          "end": {
            "line": 40,
            "character": 12
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Polygon",
    "kind": 5,
    "range": {
      "start": {
        "line": 44,
        "character": 0
      },
      "end": {
        "line": 46,
        "character": 27
      }
    },
    "selectionRange": {
      "start": {
        "line": 44,
        "character": 6
      },
      "end": {
        "line": 44,
        "character": 13
      }
    },
    "children": [
      {
        "name": "__init__",
        "kind": 6,
        "range": {
          "start": {
            "line": 45,
            "character": 4
          },
          "end": {
            "line": 46,
            "character": 27
          }
        },
        "selectionRange": {
          "start": {
            "line": 45,
            "character": 8
          },
          "end": {
            "line": 45,
            "character": 16
          }
        },
        "children": [
          {
            "name": "sides",
            "kind": 13,
            "range": {
              "start": {
                "line": 45,
                "character": 23
              },
              "end": {
                "line": 45,
                "character": 33
              }
            },
            "selectionRange": {
              "start": {
                "line": 45,
                "character": 23
              },
              "end": {
                "line": 45,
                "character": 33
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "_sides",
        "kind": 13,
        "range": {
          "start": {
            "line": 46,
            "character": 13
          },
          "end": {
            "line": 46,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 46,
            "character": 13
          },
          "end": {
            "line": 46,
            "character": 19
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Triangle",
    "kind": 5,
    "range": {
      "start": {
        "line": 49,
        "character": 0
      },
      "end": {
        "line": 51,
        "character": 27
      }
    },
    "selectionRange": {
      "start": {
        "line": 49,
        "character": 6
      },
      "end": {
        "line": 49,
        "character": 14
      }
    },
    "children": [
      {
        "name": "__init__",
        "kind": 6,
        "range": {
          "start": {
            "line": 50,
            "character": 4
          },
          "end": {
            "line": 51,
            "character": 27
          }
        },
        "selectionRange": {
          "start": {
            "line": 50,
            "character": 8
          },
          "end": {
            "line": 50,
            "character": 16
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Serializable",
    "kind": 5,
    "range": {
      "start": {
        "line": 57,
        "character": 0
      },
      "end": {
        "line": 59,
        "character": 19
      }
    },
    "selectionRange": {
      "start": {
        "line": 57,
        "character": 6
      },
      "end": {
        "line": 57,
        "character": 18
      }
    },
    "children": [
      {
        "name": "to_json",
        "kind": 6,
        "range": {
          "start": {
            "line": 58,
            "character": 4
          },
          "end": {
            "line": 59,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 58,
            "character": 8
          },
          "end": {
            "line": 58,
            "character": 15
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "LoggingMixin",
    "kind": 5,
    "range": {
      "start": {
        "line": 62,
        "character": 0
      },
      "end": {
        "line": 64,
        "character": 22
      }
    },
    "selectionRange": {
      "start": {
        "line": 62,
        "character": 6
      },
      "end": {
        "line": 62,
        "character": 18
      }
    },
    "children": [
      {
        "name": "log",
        "kind": 6,
        "range": {
          "start": {
            "line": 63,
            "character": 4
          },
          "end": {
            "line": 64,
            "character": 22
          }
        },
        "selectionRange": {
          "start": {
            "line": 63,
            "character": 8
          },
          "end": {
            "line": 63,
            "character": 11
          }
        },
        "children": [
          {
            "name": "message",
            "kind": 13,
            "range": {
              "start": {
                "line": 63,
                "character": 18
              },
              "end": {
                "line": 63,
                "character": 30
              }
            },
            "selectionRange": {
              "start": {
                "line": 63,
                "character": 18
              },
              "end": {
                "line": 63,
                "character": 30
              }
            },
            "children": []
          }
        ]
      }
    ]
  },
  {
    "name": "Widget",
    "kind": 5,
    "range": {
      "start": {
        "line": 67,
        "character": 0
      },
      "end": {
        "line": 68,
        "character": 76
      }
    },
    "selectionRange": {
      "start": {
        "line": 67,
        "character": 6
      },
      "end": {
        "line": 67,
        "character": 12
      }
    },
    "children": []
  },
  {
    "name": "Drawable",
    "kind": 5,
    "range": {
      "start": {
        "line": 74,
        "character": 0
      },
      "end": {
        "line": 79,
        "character": 11
      }
    },
    "selectionRange": {
      "start": {
        "line": 75,
        "character": 6
      },
      "end": {
        "line": 75,
        "character": 14
      }
    },
    "children": [
      {
        "name": "draw",
        "kind": 6,
        "range": {
          "start": {
            "line": 78,
            "character": 4
          },
          "end": {
            "line": 79,
            "character": 11
          }
        },
        "selectionRange": {
          "start": {
            "line": 78,
            "character": 8
          },
          "end": {
            "line": 78,
            "character": 12
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Renderable",
    "kind": 5,
    "range": {
      "start": {
        "line": 82,
        "character": 0
      },
      "end": {
        "line": 87,
        "character": 11
      }
    },
    "selectionRange": {
      "start": {
        "line": 82,
        "character": 6
      },
      "end": {
        "line": 82,
        "character": 16
      }
    },
    "children": [
      {
        "name": "render",
        "kind": 6,
        "range": {
          "start": {
            "line": 85,
            "character": 4
          },
          "end": {
            "line": 87,
            "character": 11
          }
        },
        "selectionRange": {
          "start": {
            "line": 86,
            "character": 8
          },
          "end": {
            "line": 86,
            "character": 14
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Canvas",
    "kind": 5,
    "range": {
      "start": {
        "line": 90,
        "character": 0
      },
      "end": {
        "line": 97,
        "character": 17
      }
    },
    "selectionRange": {
      "start": {
        "line": 90,
        "character": 6
      },
      "end": {
        "line": 90,
        "character": 12
      }
    },
    "children": [
      {
        "name": "draw",
        "kind": 6,
        "range": {
          "start": {
            "line": 93,
            "character": 4
          },
          "end": {
            "line": 94,
            "character": 12
          }
        },
        "selectionRange": {
          "start": {
            "line": 93,
            "character": 8
          },
          "end": {
            "line": 93,
            "character": 12
          }
        },
        "children": []
      },
      {
        "name": "render",
        "kind": 6,
        "range": {
          "start": {
            "line": 96,
            "character": 4
          },
          "end": {
            "line": 97,
            "character": 17
          }
        },
        "selectionRange": {
          "start": {
            "line": 96,
            "character": 8
          },
          "end": {
            "line": 96,
            "character": 14
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Counter",
    "kind": 5,
    "range": {
      "start": {
        "line": 103,
        "character": 0
      },
      "end": {
        "line": 121,
        "character": 25
      }
    },
    "selectionRange": {
      "start": {
        "line": 103,
        "character": 6
      },
      "end": {
        "line": 103,
        "character": 13
      }
    },
    "children": [
      {
        "name": "__init__",
        "kind": 6,
        "range": {
          "start": {
            "line": 104,
            "character": 4
          },
          "end": {
            "line": 105,
            "character": 23
          }
        },
        "selectionRange": {
          "start": {
            "line": 104,
            "character": 8
          },
          "end": {
            "line": 104,
            "character": 16
          }
        },
        "children": []
      },
      {
        "name": "count",
        "kind": 6,
        "range": {
          "start": {
            "line": 111,
            "character": 4
          },
          "end": {
            "line": 113,
            "character": 27
          }
        },
        "selectionRange": {
          "start": {
            "line": 112,
            "character": 8
          },
          "end": {
            "line": 112,
            "character": 13
          }
        },
        "children": [
          {
            "name": "value",
            "kind": 13,
            "range": {
              "start": {
                "line": 112,
                "character": 20
              },
              "end": {
                "line": 112,
                "character": 30
              }
            },
            "selectionRange": {
              "start": {
                "line": 112,
                "character": 20
              },
              "end": {
                "line": 112,
                "character": 30
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "zero",
        "kind": 6,
        "range": {
          "start": {
            "line": 115,
            "character": 4
          },
          "end": {
            "line": 117,
            "character": 20
          }
        },
        "selectionRange": {
          "start": {
            "line": 116,
            "character": 8
          },
          "end": {
            "line": 116,
            "character": 12
          }
        },
        "children": []
      },
      {
        "name": "is_zero",
        "kind": 6,
        "range": {
          "start": {
            "line": 119,
            "character": 4
          },
          "end": {
            "line": 121,
            "character": 25
          }
        },
        "selectionRange": {
          "start": {
            "line": 120,
            "character": 8
          },
          "end": {
            "line": 120,
            "character": 15
          }
        },
        "children": [
          {
            "name": "value",
            "kind": 13,
            "range": {
              "start": {
                "line": 120,
                "character": 16
              },
              "end": {
                "line": 120,
                "character": 26
              }
            },
            "selectionRange": {
              "start": {
                "line": 120,
                "character": 16
              },
              "end": {
                "line": 120,
                "character": 26
              }
            },
            "children": []
          }
        ]
      },
      {
        "name": "_count",
        "kind": 13,
        "range": {
          "start": {
            "line": 105,
            "character": 13
          },
          "end": {
            "line": 105,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 105,
            "character": 13
          },
          "end": {
            "line": 105,
            "character": 19
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Point",
    "kind": 5,
    "range": {
      "start": {
        "line": 127,
        "character": 0
      },
      "end": {
        "line": 130,
        "character": 12
      }
    },
    "selectionRange": {
      "start": {
        "line": 128,
        "character": 6
      },
      "end": {
        "line": 128,
        "character": 11
      }
    },
    "children": [
      {
        "name": "x",
        "kind": 13,
        "range": {
          "start": {
            "line": 129,
            "character": 4
          },
          "end": {
            "line": 129,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 129,
            "character": 4
          },
          "end": {
            "line": 129,
            "character": 5
          }
        },
        "children": []
      },
      {
        "name": "y",
        "kind": 13,
        "range": {
          "start": {
            "line": 130,
            "character": 4
          },
          "end": {
            "line": 130,
            "character": 5
          }
        },
        "selectionRange": {
          "start": {
            "line": 130,
            "character": 4
          },
          "end": {
            "line": 130,
            "character": 5
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "parse",
    "kind": 12,
    "range": {
      "start": {
        "line": 140,
        "character": 0
      },
      "end": {
        "line": 143,
        "character": 16
      }
    },
    "selectionRange": {
      "start": {
        "line": 140,
        "character": 4
      },
      "end": {
        "line": 140,
        "character": 9
      }
    },
    "children": [
      {
        "name": "value",
        "kind": 13,
        "range": {
          "start": {
            "line": 140,
            "character": 10
          },
          "end": {
            "line": 140,
            "character": 26
          }
        },
        "selectionRange": {
          "start": {
            "line": 140,
            "character": 10
          },
          "end": {
            "line": 140,
            "character": 26
          }
        },
        "children": []
      }
    ]
  },
  {
    "name": "Outer",
    "kind": 5,
    "range": {
      "start": {
        "line": 149,
        "character": 0
      },
      "end": {
        "line": 152,
        "character": 26
      }
    },
    "selectionRange": {
      "start": {
        "line": 149,
        "character": 6
      },
      "end": {
        "line": 149,
        "character": 11
      }
    },
    "children": [
      {
        "name": "Inner",
        "kind": 5,
        "range": {
          "start": {
            "line": 150,
            "character": 4
          },
          "end": {
            "line": 152,
            "character": 26
          }
        },
        "selectionRange": {
          "start": {
            "line": 150,
            "character": 10
          },
          "end": {
            "line": 150,
            "character": 15
          }
        },
        "children": [
          {
            "name": "hello",
            "kind": 6,
            "range": {
              "start": {
                "line": 151,
                "character": 8
              },
              "end": {
                "line": 152,
                "character": 26
              }
            },
            "selectionRange": {
              "start": {
                "line": 151,
                "character": 12
              },
              "end": {
                "line": 151,
                "character": 17
              }
            },
            "children": []
          }
        ]
      }
    ]
  },
  {
    "name": "DEFAULT_RETRIES",
    "kind": 14,
    "range": {
      "start": {
        "line": 158,
        "character": 0
      },
      "end": {
        "line": 158,
        "character": 15
      }
    },
    "selectionRange": {
      "start": {
        "line": 158,
        "character": 0
      },
      "end": {
        "line": 158,
        "character": 15
      }
    },
    "children": []
  },
  {
    "name": "greet",
    "kind": 12,
    "range": {
      "start": {
        "line": 161,
        "character": 0
      },
      "end": {
        "line": 162,
        "character": 27
      }
    },
    "selectionRange": {
      "start": {
        "line": 161,
        "character": 4
      },
      "end": {
        "line": 161,
        "character": 9
      }
    },
    "children": [
      {
        "name": "name",
        "kind": 13,
        "range": {
          "start": {
            "line": 161,
            "character": 10
          },
          "end": {
            "line": 161,
            "character": 19
          }
        },
        "selectionRange": {
          "start": {
            "line": 161,
            "character": 10
          },
          "end": {
            "line": 161,
            "character": 19
          }
        },
        "children": []
      }
    ]
  }
]
```

## T4 — hover output samples


### class Shape

position: line 36, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(class) Shape\n```\n---\nBase class with single-inheritance descendants in this file and\nmulti-file descendants in subclasses.py."
  },
  "range": {
    "start": {
      "line": 36,
      "character": 6
    },
    "end": {
      "line": 36,
      "character": 11
    }
  }
}
```

### class Widget (multi-base)

position: line 67, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(class) Widget\n```\n---\nClass with three base classes — probes multi-base extends parsing."
  },
  "range": {
    "start": {
      "line": 67,
      "character": 6
    },
    "end": {
      "line": 67,
      "character": 12
    }
  }
}
```

### class Drawable (Protocol)

position: line 75, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(class) Drawable\n```\n---\ntyping.Protocol — structural subtype; behaves like interface."
  },
  "range": {
    "start": {
      "line": 75,
      "character": 6
    },
    "end": {
      "line": 75,
      "character": 14
    }
  }
}
```

### class Renderable (ABC)

position: line 82, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(class) Renderable\n```\n---\nabc.ABC — nominal abstract class."
  },
  "range": {
    "start": {
      "line": 82,
      "character": 6
    },
    "end": {
      "line": 82,
      "character": 16
    }
  }
}
```

### class Counter

position: line 103, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(class) Counter\n```"
  },
  "range": {
    "start": {
      "line": 103,
      "character": 6
    },
    "end": {
      "line": 103,
      "character": 13
    }
  }
}
```

### @property count

position: line 108, char 8

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(property) count: (self: Self@Counter) -> int\n```"
  },
  "range": {
    "start": {
      "line": 108,
      "character": 8
    },
    "end": {
      "line": 108,
      "character": 13
    }
  }
}
```

### @classmethod zero

position: line 116, char 8

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(method) def zero(cls: type[Self@Counter]) -> Counter\n```"
  },
  "range": {
    "start": {
      "line": 116,
      "character": 8
    },
    "end": {
      "line": 116,
      "character": 12
    }
  }
}
```

### @staticmethod is_zero

position: line 120, char 8

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(method) def is_zero(value: int) -> bool\n```"
  },
  "range": {
    "start": {
      "line": 120,
      "character": 8
    },
    "end": {
      "line": 120,
      "character": 15
    }
  }
}
```

### @dataclass Point

position: line 128, char 6

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(class) Point\n```"
  },
  "range": {
    "start": {
      "line": 128,
      "character": 6
    },
    "end": {
      "line": 128,
      "character": 11
    }
  }
}
```

### type alias form 1 (bare)

position: line 23, char 0

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(type) UserIdV1 = str\n```"
  },
  "range": {
    "start": {
      "line": 23,
      "character": 0
    },
    "end": {
      "line": 23,
      "character": 8
    }
  }
}
```

### type alias form 2 (TypeAlias)

position: line 26, char 0

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(type) UserIdV2 = str\n```"
  },
  "range": {
    "start": {
      "line": 26,
      "character": 0
    },
    "end": {
      "line": 26,
      "character": 8
    }
  }
}
```

### type alias form 3 (PEP 695)

position: line 30, char 5

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(type) UserIdV3 = str\n```"
  },
  "range": {
    "start": {
      "line": 30,
      "character": 5
    },
    "end": {
      "line": 30,
      "character": 13
    }
  }
}
```

### overloaded parse (first @overload)

position: line 137, char 4

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(function) def parse(value: int) -> int\n```"
  },
  "range": {
    "start": {
      "line": 137,
      "character": 4
    },
    "end": {
      "line": 137,
      "character": 9
    }
  }
}
```

### function greet

position: line 161, char 4

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(function) def greet(name: str) -> str\n```"
  },
  "range": {
    "start": {
      "line": 161,
      "character": 4
    },
    "end": {
      "line": 161,
      "character": 9
    }
  }
}
```

### module constant

position: line 158, char 0

```json
{
  "contents": {
    "kind": "markdown",
    "value": "```python\n(constant) DEFAULT_RETRIES: Literal[3]\n```"
  },
  "range": {
    "start": {
      "line": 158,
      "character": 0
    },
    "end": {
      "line": 158,
      "character": 15
    }
  }
}
```

## T1 — implementation (the critical probe)

For each target, asks Pyright `textDocument/implementation` at the symbol's declaration and records what it returns. If results point at subclasses.py entries, we have `usedByTypes` via LSP. If results point at parent/self/empty, we need the inventory-walk fallback.

### Shape

position: line 36, char 6

```json
{
  "error": "Error: LSP 'textDocument/implementation' error -32601: Unhandled method textDocument/implementation"
}
```

### Polygon

position: line 44, char 6

```json
{
  "error": "Error: LSP 'textDocument/implementation' error -32601: Unhandled method textDocument/implementation"
}
```

### Renderable (ABC)

position: line 82, char 6

```json
{
  "error": "Error: LSP 'textDocument/implementation' error -32601: Unhandled method textDocument/implementation"
}
```

### Drawable (Protocol)

position: line 75, char 6

```json
{
  "error": "Error: LSP 'textDocument/implementation' error -32601: Unhandled method textDocument/implementation"
}
```

## T2 — references (Counter, Triangle, greet)


### Counter

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/consumer.py",
    "range": {
      "start": {
        "line": 6,
        "character": 19
      },
      "end": {
        "line": 6,
        "character": 26
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/consumer.py",
    "range": {
      "start": {
        "line": 10,
        "character": 14
      },
      "end": {
        "line": 10,
        "character": 21
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/sample.py",
    "range": {
      "start": {
        "line": 116,
        "character": 22
      },
      "end": {
        "line": 116,
        "character": 29
      }
    }
  }
]
```

### Triangle

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/consumer.py",
    "range": {
      "start": {
        "line": 6,
        "character": 35
      },
      "end": {
        "line": 6,
        "character": 43
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/consumer.py",
    "range": {
      "start": {
        "line": 17,
        "character": 10
      },
      "end": {
        "line": 17,
        "character": 18
      }
    }
  }
]
```

### greet

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/consumer.py",
    "range": {
      "start": {
        "line": 6,
        "character": 45
      },
      "end": {
        "line": 6,
        "character": 50
      }
    }
  },
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/consumer.py",
    "range": {
      "start": {
        "line": 20,
        "character": 10
      },
      "end": {
        "line": 20,
        "character": 15
      }
    }
  }
]
```

## T5 — Overloads (parse function)

Captures how documentSymbol represents @overload alternates (one entry? three?) and what hover returns on each.

### documentSymbol entries named 'parse'

count: 1
```json
[
  {
    "name": "parse",
    "kind": 12,
    "range": {
      "start": {
        "line": 140,
        "character": 0
      },
      "end": {
        "line": 143,
        "character": 16
      }
    },
    "selectionRange": {
      "start": {
        "line": 140,
        "character": 4
      },
      "end": {
        "line": 140,
        "character": 9
      }
    },
    "children": [
      {
        "name": "value",
        "kind": 13,
        "range": {
          "start": {
            "line": 140,
            "character": 10
          },
          "end": {
            "line": 140,
            "character": 26
          }
        },
        "selectionRange": {
          "start": {
            "line": 140,
            "character": 10
          },
          "end": {
            "line": 140,
            "character": 26
          }
        },
        "children": []
      }
    ]
  }
]
```

## Bonus — textDocument/typeDefinition

For completeness: capture what typeDefinition returns on a few targets so ADR-13 can decide whether it plays a role in the type-info story.

### Counter expression

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/test/fixtures/pyright-probe/sample.py",
    "range": {
      "start": {
        "line": 103,
        "character": 6
      },
      "end": {
        "line": 103,
        "character": 13
      }
    }
  }
]
```

### UserIdV2 name

```json
[
  {
    "uri": "file:///c%3A/CodeWork/contextatlas/node_modules/pyright/dist/typeshed-fallback/stdlib/builtins.pyi",
    "range": {
      "start": {
        "line": 479,
        "character": 6
      },
      "end": {
        "line": 479,
        "character": 9
      }
    }
  }
]
```
