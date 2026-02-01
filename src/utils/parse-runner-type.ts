/**
 * Extracts the runner type from a runner name.
 *
 * Examples:
 *   "aws-ci-k8s-runner-jest-dedicated-bg4b2-runner-pxxdt" → "jest-dedicated"
 *   "aws-ci-k8s-runner-general-purpose-2xl-j9khm-runner-nj4vj" → "general-purpose-2xl"
 *   "aws-k8s-runner-general-purpose-rprhd-runner-c86pl" → "general-purpose"
 *   "GitHub Actions 1003463699" → "github-actions"
 *   "GitHub Actions 42" → "github-actions"
 *   null → "unknown"
 *
 * @param runnerName - The runner name from GitHub API (can be null)
 * @returns The runner type (normalized for use as a Prometheus label)
 */
export const parseRunnerType = (runnerName: string | null): string => {
  if (!runnerName) {
    return 'unknown'
  }

  // Handle GitHub-hosted runners
  if (runnerName.startsWith('GitHub Actions')) {
    return 'github-actions'
  }

  // Handle self-hosted runners with pattern:
  // aws-ci-k8s-runner-{TYPE}-{HASH}-runner-{POD}
  // aws-k8s-runner-{TYPE}-{HASH}-runner-{POD}

  // Match pattern: (aws-ci-k8s-runner- or aws-k8s-runner-) followed by type, then -runner-
  const match = runnerName.match(/^aws-(?:ci-)?k8s-runner-(.+?)-[a-z0-9]+-runner-[a-z0-9]+$/)

  if (match && match[1]) {
    return match[1] // e.g., "jest-dedicated", "general-purpose-2xl"
  }

  // Fallback: try to extract anything between "runner-" and the last part
  const parts = runnerName.split('-')
  if (parts.length >= 4) {
    // Find the index of "runner" (first occurrence after prefix)
    const runnerIndex = parts.indexOf('runner', 2)
    if (runnerIndex > 2) {
      // Extract everything between prefix and hash
      // e.g., ["aws", "ci", "k8s", "runner", "jest", "dedicated", "bg4b2", "runner", "pxxdt"]
      //                                       ^---- start      ^---- end (before hash)
      const typeStart = 4 // After "aws-ci-k8s-runner-" or "aws-k8s-runner-"
      const typeEnd = parts.findIndex((part, idx) =>
        idx > typeStart && part === 'runner'
      )

      if (typeEnd > typeStart) {
        return parts.slice(typeStart, typeEnd - 1).join('-')
      }
    }
  }

  // Last resort: return the runner name as-is (shouldn't happen often)
  return runnerName
}
