import { gettext as t } from 'i18n'

AppSettingsPage({
  build(ctx) {
    const authStateRaw = ctx.settingsStorage.getItem('auth_state')
    const authState = authStateRaw ? JSON.parse(authStateRaw) : { state: 'unauthenticated' }

    const deviceCodeRaw = ctx.settingsStorage.getItem('device_code_info')
    const deviceCode = deviceCodeRaw ? JSON.parse(deviceCodeRaw) : null

    const selectedRepoRaw = ctx.settingsStorage.getItem('selected_repo')
    const selectedRepo = selectedRepoRaw ? JSON.parse(selectedRepoRaw) : null

    const isAuthenticated = authState.state === 'authenticated'

    // Keep side service alive
    ctx.settingsStorage.setItem('_heartbeat', Date.now().toString())

    return Section({}, [

      // ── Header ──────────────────────────────────────────────────────────────
      View({ style: styles.header }, [
        Text({ style: styles.appTitle }, '📒 Git Notes'),
        Text({ style: styles.appSubtitle }, 'GitHub markdown notes on your wrist'),
      ]),

      // ── GitHub Account ───────────────────────────────────────────────────────
      Section({}, [
        View({ style: styles.sectionLabel }, [
          Text({ style: styles.sectionTitle }, 'GITHUB ACCOUNT'),
        ]),
        buildAuthSection(authState, deviceCode, ctx),
      ]),

      // ── Repository (only when authenticated) ────────────────────────────────
      isAuthenticated ? Section({}, [
        View({ style: styles.sectionLabel }, [
          Text({ style: styles.sectionTitle }, 'NOTES REPOSITORY'),
        ]),
        buildRepoSection(selectedRepo, ctx),
      ]) : null,

      // ── File Filter (only when authenticated) ────────────────────────────────
      isAuthenticated ? Section({}, [
        View({ style: styles.sectionLabel }, [
          Text({ style: styles.sectionTitle }, 'FILE FILTER'),
        ]),
        buildFilterSection(ctx),
      ]) : null,

      // ── Sign out ─────────────────────────────────────────────────────────────
      isAuthenticated ? View({ style: styles.signOutRow }, [
        Button({
          label: 'Sign Out',
          style: styles.dangerButton,
          onClick: () => {
            ctx.settingsStorage.removeItem('access_token')
            ctx.settingsStorage.removeItem('device_code_info')
            ctx.settingsStorage.removeItem('selected_repo')
            ctx.settingsStorage.setItem('auth_state', JSON.stringify({ state: 'unauthenticated' }))
          },
        }),
      ]) : null,

    ])
  },
})

// ─── Auth section ────────────────────────────────────────────────────────────

function buildAuthSection(authState, deviceCode, ctx) {
  switch (authState.state) {
    case 'unauthenticated':
      return View({ style: styles.card }, [
        Text({ style: styles.body }, 'Connect your GitHub account to browse and sync markdown notes.'),
        Button({
          label: '  Login with GitHub',
          style: styles.primaryButton,
          onClick: () => ctx.settingsStorage.setItem('auth_trigger', Date.now().toString()),
        }),
      ])

    case 'pending':
      return View({ style: styles.card }, [
        Text({ style: styles.muted }, 'Starting Device Flow…'),
      ])

    case 'waiting_user':
      return deviceCode
        ? View({ style: styles.card }, [
            Text({ style: styles.body }, 'Open in your browser:'),
            Text({ style: styles.codeUrl }, deviceCode.verificationUri),
            Text({ style: styles.body }, 'Then enter this code:'),
            View({ style: styles.codeBox }, [
              Text({ style: styles.userCode }, deviceCode.userCode),
            ]),
            Text({ style: styles.muted }, 'Waiting for authorization… Code expires soon.'),
            Button({
              label: 'Cancel',
              style: styles.secondaryButton,
              onClick: () => ctx.settingsStorage.setItem('auth_cancel', '1'),
            }),
          ])
        : View({ style: styles.card }, [
            Text({ style: styles.muted }, 'Requesting code…'),
          ])

    case 'authenticated':
      return View({ style: styles.card }, [
        Text({ style: styles.successText }, '✓  Signed in as ' + authState.username),
      ])

    case 'error':
      return View({ style: styles.card }, [
        Text({ style: styles.errorText }, '✗  ' + (authState.message || 'Authentication failed')),
        Button({
          label: 'Try Again',
          style: styles.primaryButton,
          onClick: () => ctx.settingsStorage.setItem('auth_trigger', Date.now().toString()),
        }),
      ])

    default:
      return null
  }
}

// ─── Repo section ─────────────────────────────────────────────────────────────

function buildRepoSection(selectedRepo, ctx) {
  // Temp state held in settingsStorage while editing
  const editingRaw = ctx.settingsStorage.getItem('_editing_repo')
  const editing = editingRaw === '1'

  if (!editing && selectedRepo) {
    return View({ style: styles.card }, [
      Text({ style: styles.repoTitle }, selectedRepo.owner + ' / ' + selectedRepo.name),
      Text({ style: styles.muted }, 'Branch: ' + (selectedRepo.branch || 'main')),
      View({ style: styles.rowButtons }, [
        Button({
          label: 'Change',
          style: styles.secondaryButton,
          onClick: () => ctx.settingsStorage.setItem('_editing_repo', '1'),
        }),
      ]),
    ])
  }

  // Show the entry form
  const draft = (() => {
    try { return JSON.parse(ctx.settingsStorage.getItem('_repo_draft') || '{}') } catch (e) { return {} }
  })()

  return View({ style: styles.card }, [
    Text({ style: styles.label }, 'Repository Owner (username or org):'),
    Input({
      style: styles.input,
      value: draft.owner || (selectedRepo ? selectedRepo.owner : ''),
      placeholder: 'octocat',
      onChange: (val) => saveDraft(ctx, { owner: val }),
    }),

    Text({ style: styles.label }, 'Repository Name:'),
    Input({
      style: styles.input,
      value: draft.name || (selectedRepo ? selectedRepo.name : ''),
      placeholder: 'my-notes',
      onChange: (val) => saveDraft(ctx, { name: val }),
    }),

    Text({ style: styles.label }, 'Branch (leave blank for main/master):'),
    Input({
      style: styles.input,
      value: draft.branch || (selectedRepo ? selectedRepo.branch || '' : ''),
      placeholder: 'main',
      onChange: (val) => saveDraft(ctx, { branch: val }),
    }),

    View({ style: styles.rowButtons }, [
      Button({
        label: 'Save',
        style: styles.primaryButton,
        onClick: () => {
          const d = (() => {
            try { return JSON.parse(ctx.settingsStorage.getItem('_repo_draft') || '{}') } catch (e) { return {} }
          })()
          if (d.owner && d.name) {
            ctx.settingsStorage.setItem('selected_repo', JSON.stringify({
              owner: d.owner.trim(),
              name: d.name.trim(),
              branch: (d.branch || 'main').trim(),
            }))
            ctx.settingsStorage.removeItem('_editing_repo')
            ctx.settingsStorage.removeItem('_repo_draft')
          }
        },
      }),
      selectedRepo ? Button({
        label: 'Cancel',
        style: styles.secondaryButton,
        onClick: () => {
          ctx.settingsStorage.removeItem('_editing_repo')
          ctx.settingsStorage.removeItem('_repo_draft')
        },
      }) : null,
    ]),
  ])
}

function saveDraft(ctx, partial) {
  try {
    const current = JSON.parse(ctx.settingsStorage.getItem('_repo_draft') || '{}')
    ctx.settingsStorage.setItem('_repo_draft', JSON.stringify({ ...current, ...partial }))
  } catch (e) {}
}

// ─── Filter section ───────────────────────────────────────────────────────────

function buildFilterSection(ctx) {
  const raw = ctx.settingsStorage.getItem('file_extensions')
  const current = raw || '.md,.markdown,.txt'

  return View({ style: styles.card }, [
    Text({ style: styles.body }, 'File extensions to sync (comma-separated):'),
    Input({
      style: styles.input,
      value: current,
      placeholder: '.md,.markdown,.txt',
      onChange: (val) => {
        const exts = val.split(',').map(e => e.trim()).filter(e => e.startsWith('.'))
        if (exts.length > 0) {
          ctx.settingsStorage.setItem('file_extensions', JSON.stringify(exts))
        }
      },
    }),
    Text({ style: styles.muted }, 'Default: .md, .markdown, .txt — Only these files will be downloaded to your watch.'),
  ])
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  header: {
    padding: '20px 16px 12px',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
  },
  appTitle: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#c9d1d9',
  },
  appSubtitle: {
    fontSize: '13px',
    color: '#8b949e',
    marginTop: '4px',
  },
  sectionLabel: {
    padding: '14px 16px 4px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#8b949e',
    letterSpacing: '0.8px',
  },
  card: {
    padding: '12px 16px',
    gap: '10px',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    fontSize: '14px',
    color: '#c9d1d9',
    lineHeight: '1.5',
  },
  muted: {
    fontSize: '12px',
    color: '#8b949e',
    lineHeight: '1.4',
  },
  label: {
    fontSize: '13px',
    color: '#8b949e',
    marginBottom: '2px',
  },
  input: {
    fontSize: '14px',
    color: '#c9d1d9',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '7px 10px',
  },
  codeUrl: {
    fontSize: '14px',
    color: '#58a6ff',
    fontWeight: 'bold',
  },
  codeBox: {
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '10px',
    alignItems: 'center',
  },
  userCode: {
    fontSize: '30px',
    fontWeight: 'bold',
    color: '#c9d1d9',
    letterSpacing: '6px',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  successText: {
    fontSize: '15px',
    color: '#3fb950',
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: '14px',
    color: '#f85149',
  },
  repoTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#58a6ff',
  },
  rowButtons: {
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    marginTop: '4px',
  },
  primaryButton: {
    fontSize: '14px',
    background: '#238636',
    color: 'white',
    borderRadius: '6px',
    padding: '8px 16px',
    border: 'none',
    flex: '1',
  },
  secondaryButton: {
    fontSize: '14px',
    background: '#21262d',
    color: '#c9d1d9',
    borderRadius: '6px',
    padding: '8px 16px',
    border: '1px solid #30363d',
    flex: '1',
  },
  signOutRow: {
    padding: '8px 16px 20px',
  },
  dangerButton: {
    fontSize: '14px',
    background: 'transparent',
    color: '#f85149',
    borderRadius: '6px',
    padding: '8px 16px',
    border: '1px solid #f8514940',
    width: '100%',
  },
}
