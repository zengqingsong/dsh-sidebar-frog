    // ── Panel actions ───────────────────────────────────────────────────────
    // Three different actions, three different pictures. They used to share one
    // glyph (a panel box with a pop-out arrow) for "收起侧边栏" AND for the closed
    // state's trigger, while the actual pop-out was a bare「↖」— so the button
    // that closed the panel looked like the button that opened or popped it out.
    //
    // 「打开侧边栏」: the panel itself — a box with the divider on the right.
    const PanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.5 }),
      React.createElement('line', { x1: 10.2, y1: 3.4, x2: 10.2, y2: 12.6, stroke: 'currentColor', strokeWidth: 1.5 }),
      React.createElement('line', { x1: 12.4, y1: 6.4, x2: 12.4, y2: 9.6, stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
    )

    // 「收起侧边栏」: the panel's edge with both chevrons pointing into it — the
    // standard "collapse this panel" glyph (the mirror of how the main sidebar
    // toggle reads).
    const CollapsePanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('line', { x1: 13.2, y1: 3, x2: 13.2, y2: 13, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      React.createElement('path', { d: 'M3.2 5.4 L5.8 8 L3.2 10.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M7.4 5.4 L10 8 L7.4 10.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )

    // 「弹出到新标签页」: an arrow leaving a box — the window that opens is the
    // point, so the glyph is the gesture, not the panel.
    const PopoutIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', {
        d: 'M6.6 3.2H3.7A1.3 1.3 0 0 0 2.4 4.5v7.8a1.3 1.3 0 0 0 1.3 1.3h7.8a1.3 1.3 0 0 0 1.3-1.3V9.4',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      }),
      React.createElement('path', { d: 'M9.8 2.4h3.8v3.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M13.4 2.6 L8 8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    )

    // Directory rows draw the SAME outline folder the built-in tree draws
    // (FolderCloseArtwork / IconFolderOpenArtwork, geometry generated from the
    // install, description shared through filetype.js folderGlyphParts). The
    // closed folder is two 1px strokes; the open one is three fills, the front
    // panel at 16% — copying the artwork is what makes a folder look like the
    // shell's own rather than merely folder-shaped.
    const FolderClosedIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      folderGlyphParts(false).map((part, i) => React.createElement('path', {
        key: i, d: part.d, stroke: part.stroke, strokeWidth: part.strokeWidth,
      })))

    const FolderOpenIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      folderGlyphParts(true).map((part, i) => React.createElement('path', {
        key: i, d: part.d, fill: part.fill, opacity: part.opacity,
      })))

    const FileCodeIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      fillRule: 'evenodd', clipRule: 'evenodd',
      d: 'M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z',
      fill: 'currentColor',
    }))

    const RefreshIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', { d: 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z', fill: 'currentColor' }))

    // ── File-type glyph (the shell's own `FileTypeIcon`) ────────────────
    // The picture a file row gets, described by src/shared/filetype.js so the
    // popout page's DOM tree draws byte-identical geometry from the same data:
    //
    //   * a CODE FILE gets its language's full-colour brand square — the 48
    //     20×20 glyphs the built-in tree shows (the JS logo, the Rust gear, the
    //     Node hexagon for `package.json`);
    //   * anything else gets the 28×28 file card whose mark names the kind
    //     (MD / PDF / a spreadsheet grid / a play triangle / the code chevrons),
    //     tinted by the kind class on the wrapping span.
    //
    // This replaces a generic stroked document outline that said only "this is
    // a file": the colour and the mark ARE the type signal, and a 48-icon brand
    // set is the thing the built-in tree was already reading.
    let iconInstanceSeq = 0
    const FileTypeGlyph = (props) => {
      const px = props.size || 16
      const glyph = iconGlyph(props.path)
      if (glyph.tier === 'code') {
        // Instance-scoped ids: 31 of the 48 glyphs carry <linearGradient> /
        // <clipPath> and their artwork references those ids. Two rows showing
        // the same brand — or one row repainted — would make the second copy
        // silently borrow the first one's paint, so every instance stamps its
        // own id into the token. `useId` is what the primitives' own
        // CodeFileIcon uses; the counter is the fallback for a React without it
        // (the call stays unconditional, so hook order never depends on state).
        const hasUseId = typeof React.useId === 'function'
        const rawId = hasUseId ? React.useId() : ''
        const instanceId = 'dsh-code-icon-' +
          (rawId ? String(rawId).replace(/:/g, '') : 'i' + (iconInstanceSeq += 1))
        return React.createElement('svg', {
          width: px, height: px, viewBox: '0 0 20 20', className: props.className,
          xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
          dangerouslySetInnerHTML: { __html: glyph.art.split(CODE_ICON_ID_TOKEN).join(instanceId) },
        })
      }
      // The card: body + folded corner, then the kind's mark inside the group
      // whose transform scales it (null for `code` / `excel`, exactly as the
      // built-in leaves those two untransformed).
      const bodyAndFold = glyph.parts.slice(0, 2)
      const marks = glyph.parts.slice(2)
      return React.createElement('svg', {
        width: px, height: px, viewBox: '0 0 28 28', fill: 'none', className: props.className,
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
      },
        bodyAndFold.map((part, i) => React.createElement('path', {
          key: 'p' + i, d: part.d, fill: part.fill, fillOpacity: part.fillOpacity,
        })),
        glyph.mark
          ? React.createElement('g', { key: 'mark', transform: glyph.markTransform || undefined },
            marks.map((part, i) => React.createElement('path', {
              key: 'm' + i, d: part.d,
              fill: part.fill, fillRule: part.fillRule, clipRule: part.clipRule,
              stroke: part.stroke, strokeWidth: part.strokeWidth,
            })))
          : null,
      )
    }

    // Disclosure chevron for tree rows (CSS rotates it: right → down).
    const TreeChevronIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      d: 'M3.4 1.6 L6.8 5 L3.4 8.4',
      stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
    }))

    // Explorer toolbar: expand all / collapse all / filter.
    const ExpandAllIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M4 6.2 L8 2.6 L12 6.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M4 9.8 L8 13.4 L12 9.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )

    const CollapseAllIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M4 2.6 L8 6.2 L12 2.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M4 13.4 L8 9.8 L12 13.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )

    const SearchIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('circle', { cx: 7, cy: 7, r: 4.2, stroke: 'currentColor', strokeWidth: 1.3 }),
      React.createElement('path', { d: 'M10.2 10.2 L13.6 13.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
    )

    // 新建: the tree header's plus. It opens the two create verbs rather than
    // guessing a kind, which is why it is a plus and not a "new file" glyph.
    const PlusIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M8 3.2 V12.8 M3.2 8 H12.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    )

    const CloseIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      d: 'M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5',
      stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
    }))
