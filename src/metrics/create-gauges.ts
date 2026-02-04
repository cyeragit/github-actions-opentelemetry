import * as opentelemetry from '@opentelemetry/api'
import {
  getLatestCompletedAt,
  getEarliestStartedAt,
  WorkflowRun,
  WorkflowJob,
  WorkflowJobs,
  WorkflowStep
} from '../github/index.js'
import { calcDiffSec } from '../utils/calc-diff-sec.js'
import { descriptorNames as dn, attributeKeys as ak } from './constants.js'
import * as core from '@actions/core'

export const createGauge = (
  name: string,
  value: number,
  attributes: opentelemetry.Attributes,
  option?: opentelemetry.MetricOptions
): void => {
  const meter = opentelemetry.metrics.getMeter('github-actions-metrics')

  const gauge = meter.createGauge(name, option)
  gauge.record(value, attributes)
}

export const createCounter = (
  name: string,
  value: number,
  attributes: opentelemetry.Attributes,
  option?: opentelemetry.MetricOptions
): void => {
  const meter = opentelemetry.metrics.getMeter('github-actions-metrics')

  const counter = meter.createCounter(name, option)
  counter.add(value, attributes)
}

const createMetricsAttributes = (
  workflow: WorkflowRun,
  job?: WorkflowJob
): opentelemetry.Attributes => ({
  [ak.WORKFLOW_NAME]: workflow.name,
  [ak.REPOSITORY]: workflow.repository.full_name,
  ...(workflow.conclusion && { [ak.WORKFLOW_CONCLUSION]: workflow.conclusion }),
  ...(workflow.actor && { [ak.WORKFLOW_ACTOR]: workflow.actor }),
  ...(workflow.event && { [ak.WORKFLOW_EVENT]: workflow.event }),
  ...(workflow.head_branch && {
    [ak.WORKFLOW_HEAD_BRANCH]: workflow.head_branch
  }),
  ...(workflow.base_branch && {
    [ak.WORKFLOW_BASE_BRANCH]: workflow.base_branch
  }),
  ...(job && { [ak.JOB_NAME]: job.name }),
  ...(job && job.conclusion && { [ak.JOB_CONCLUSION]: job.conclusion }), // conclusion specification: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks#check-statuses-and-conclusions
  ...(job && job.runner_name && { [ak.RUNNER_NAME]: job.runner_name }),
  ...(job &&
    job.runner_group_name && { [ak.RUNNER_GROUP_NAME]: job.runner_group_name }),
  ...(job && { [ak.RUNNER_TYPE]: job.runner_type })
})

export const createWorkflowGauges = (
  workflow: WorkflowRun,
  workflowRunJobs: WorkflowJobs
): void => {
  const workflowMetricsAttributes = createMetricsAttributes(workflow)

  // Debug: log the attributes being used
  core.info(
    `Workflow metrics attributes: ${JSON.stringify(workflowMetricsAttributes)}`
  )
  core.info(
    `Workflow data - actor: ${workflow.actor}, event: ${workflow.event}, head_branch: ${workflow.head_branch}, base_branch: ${workflow.base_branch}`
  )

  // workflow run context has no end time, so use the latest job's completed_at
  const jobCompletedAtMax = getLatestCompletedAt(workflowRunJobs)
  createGauge(
    dn.WORKFLOW_DURATION,
    calcDiffSec(workflow.created_at, jobCompletedAtMax),
    workflowMetricsAttributes,
    { unit: 's' }
  )

  // workflow queue duration = time from workflow creation to first job start
  const jobStartedAtMin = getEarliestStartedAt(workflowRunJobs)
  const workflowQueuedDuration = calcDiffSec(
    workflow.created_at,
    jobStartedAtMin
  )
  if (workflowQueuedDuration >= 0) {
    createGauge(
      dn.WORKFLOW_QUEUED_DURATION,
      workflowQueuedDuration,
      workflowMetricsAttributes,
      { unit: 's' }
    )
  } else {
    core.notice(
      `${workflow.name}: Skip creating ${dn.WORKFLOW_QUEUED_DURATION} metric. Queue duration is negative (${workflowQueuedDuration}s), indicating a timing issue.`
    )
  }

  // Record workflow run as counter (value=1) for counting in Prometheus
  // Testing if counters work when properly compiled (push-based metric)
  createCounter(
    dn.WORKFLOW_RUNS,
    1,
    workflowMetricsAttributes,
    { unit: '1', description: 'Workflow run counter for accurate success rate calculations' }
  )
}

export const createJobGauges = (
  workflow: WorkflowRun,
  workflowRunJobs: WorkflowJobs
): void => {
  for (const job of workflowRunJobs) {
    const jobMetricsAttributes = createMetricsAttributes(workflow, job)
    createGauge(
      dn.JOB_DURATION,
      calcDiffSec(job.started_at, job.completed_at),
      jobMetricsAttributes,
      { unit: 's' }
    )

    // The calculation method for GitHub's queue times has not been disclosed.
    // Since it is displayed in the job column, it is assumed to be calculated based on job information.
    // See. https://docs.github.com/en/actions/administering-github-actions/viewing-github-actions-metrics
    const jobQueuedDuration = calcDiffSec(job.created_at, job.started_at)
    if (jobQueuedDuration < 0) {
      core.notice(
        `${job.name}: Skip to create ${dn.JOB_QUEUED_DURATION} metrics. This is a GitHub specification issue that occasionally occurs, so it can't be recover.`
      )
      continue
    }
    createGauge(
      dn.JOB_QUEUED_DURATION,
      jobQueuedDuration,
      jobMetricsAttributes,
      { unit: 's' }
    )

    // Record job run as counter (value=1) for counting in Prometheus
    // Testing if counters work when properly compiled (push-based metric)
    createCounter(
      dn.JOB_RUNS,
      1,
      jobMetricsAttributes,
      { unit: '1', description: 'Job run counter for accurate success rate calculations' }
    )

    // Create step-level metrics for each step in the job
    createStepGauges(workflow, job)
  }
}

const createStepMetricsAttributes = (
  workflow: WorkflowRun,
  job: WorkflowJob,
  step: WorkflowStep
): opentelemetry.Attributes => ({
  [ak.WORKFLOW_NAME]: workflow.name,
  [ak.REPOSITORY]: workflow.repository.full_name,
  ...(workflow.conclusion && { [ak.WORKFLOW_CONCLUSION]: workflow.conclusion }),
  ...(workflow.actor && { [ak.WORKFLOW_ACTOR]: workflow.actor }),
  ...(workflow.event && { [ak.WORKFLOW_EVENT]: workflow.event }),
  ...(workflow.head_branch && {
    [ak.WORKFLOW_HEAD_BRANCH]: workflow.head_branch
  }),
  ...(workflow.base_branch && {
    [ak.WORKFLOW_BASE_BRANCH]: workflow.base_branch
  }),
  [ak.JOB_NAME]: job.name,
  ...(job.conclusion && { [ak.JOB_CONCLUSION]: job.conclusion }),
  ...(job.runner_name && { [ak.RUNNER_NAME]: job.runner_name }),
  ...(job.runner_group_name && { [ak.RUNNER_GROUP_NAME]: job.runner_group_name }),
  [ak.RUNNER_TYPE]: job.runner_type,
  [ak.STEP_NAME]: step.name,
  [ak.STEP_CONCLUSION]: step.conclusion
})

export const createStepGauges = (
  workflow: WorkflowRun,
  job: WorkflowJob
): void => {
  for (const step of job.steps) {
    const stepMetricsAttributes = createStepMetricsAttributes(workflow, job, step)

    // Calculate step duration
    const stepDuration = calcDiffSec(step.started_at, step.completed_at)
    if (stepDuration >= 0) {
      createGauge(
        dn.STEP_DURATION,
        stepDuration,
        stepMetricsAttributes,
        { unit: 's', description: 'Duration of individual workflow step' }
      )
    } else {
      core.notice(
        `${job.name}/${step.name}: Skip creating ${dn.STEP_DURATION} metric. Duration is negative (${stepDuration}s), indicating a timing issue.`
      )
    }

    // Record step run as counter (value=1) for counting in Prometheus
    createCounter(
      dn.STEP_RUNS,
      1,
      stepMetricsAttributes,
      { unit: '1', description: 'Step run counter for step-level success rate calculations' }
    )
  }
}
