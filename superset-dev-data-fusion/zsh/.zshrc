# Superset zsh rc wrapper
_superset_saved_env="$(export -p 2>/dev/null | grep ' SUPERSET_')"
_superset_home="${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zshrc" ]] && source "$_superset_home/.zshrc"
eval "$_superset_saved_env" 2>/dev/null || true
_superset_prepend_bin() {
  case ":$PATH:" in
    *:'/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/bin':*) ;;
    *) export PATH='/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/bin':"$PATH" ;;
  esac
}
_superset_prepend_bin
typeset -ga precmd_functions 2>/dev/null || true
_superset_ensure_path() {
  case ":$PATH:" in
    *:'/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/bin':*) ;;
    *) PATH='/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/bin':"$PATH" ;;
  esac
}
{
  # Keep our hook last so it wins over other PATH-mutating precmd hooks.
  precmd_functions=(${precmd_functions:#_superset_ensure_path} _superset_ensure_path)
} 2>/dev/null || true
rehash 2>/dev/null || true
# Restore ZDOTDIR so our .zlogin runs after user's .zlogin
export ZDOTDIR='/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/zsh'
