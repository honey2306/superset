# Superset zsh login wrapper
_superset_saved_env="$(export -p 2>/dev/null | grep ' SUPERSET_')"
_superset_home="${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
if [[ -o interactive ]]; then
  [[ -f "$_superset_home/.zlogin" ]] && source "$_superset_home/.zlogin"
fi
eval "$_superset_saved_env" 2>/dev/null || true
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
_superset_prepend_bin() {
  case ":$PATH:" in
    *:'/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/bin':*) ;;
    *) export PATH='/Users/wufan/.codex/worktrees/99c0/superset/superset-dev-data-fusion/bin':"$PATH" ;;
  esac
}
_superset_prepend_bin
rehash 2>/dev/null || true
# Shell readiness markers. Emitting both keeps us compatible across daemon
# versions: the legacy v1 daemon scans for OSC 777, the current scanner (v1
# post-refactor + v2 host-service) scans for OSC 133;A (FinalTerm standard).
# Wrappers are rewritten on every app launch, so main always ships the
# superset of markers; daemons that only get restarted on protocol bumps
# still match against their own scanner.
# Protocol ref: https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
__superset_prompt_mark() {
  printf "\033]777;superset-shell-ready\007\033]133;A\007"
}
# Keep our hook LAST so it fires after direnv and other precmd hooks complete.
precmd_functions=(${precmd_functions[@]} __superset_prompt_mark)
export ZDOTDIR="$_superset_home"
