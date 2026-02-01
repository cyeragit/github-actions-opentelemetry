import { describe, test, expect } from 'vitest'
import { parseRunnerType } from './parse-runner-type.js'

describe('parseRunnerType', () => {
  test('should parse jest-dedicated runner', () => {
    const runnerName = 'aws-ci-k8s-runner-jest-dedicated-bg4b2-runner-pxxdt'
    expect(parseRunnerType(runnerName)).toBe('jest-dedicated')
  })

  test('should parse general-purpose-2xl runner', () => {
    const runnerName = 'aws-ci-k8s-runner-general-purpose-2xl-j9khm-runner-nj4vj'
    expect(parseRunnerType(runnerName)).toBe('general-purpose-2xl')
  })

  test('should parse general-purpose runner (without ci prefix)', () => {
    const runnerName = 'aws-k8s-runner-general-purpose-rprhd-runner-c86pl'
    expect(parseRunnerType(runnerName)).toBe('general-purpose')
  })

  test('should parse GitHub Actions runners', () => {
    expect(parseRunnerType('GitHub Actions 1003463699')).toBe('github-actions')
    expect(parseRunnerType('GitHub Actions 42')).toBe('github-actions')
  })

  test('should handle null runner name', () => {
    expect(parseRunnerType(null)).toBe('unknown')
  })

  test('should handle empty string', () => {
    expect(parseRunnerType('')).toBe('unknown')
  })

  test('should parse build runner types', () => {
    const runnerName = 'aws-ci-k8s-runner-build-wqpsv-runner-zdtx6'
    expect(parseRunnerType(runnerName)).toBe('build')
  })

  test('should parse build c6a runner types', () => {
    const runnerName = 'aws-ci-k8s-runner-build-c6a-m9st4-runner-h25xb'
    expect(parseRunnerType(runnerName)).toBe('build-c6a')
  })
})
