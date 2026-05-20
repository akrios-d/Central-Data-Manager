import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Chain, ChainStep, ChainStepRun, StepStatus } from '../../core/models/chain.model';
import { parseDispatchInputs } from '../../core/utils/workflow-parser';
import { ChainService } from '../../core/services/chain.service';
import { ChainExecutorService } from '../../core/services/chain-executor.service';
import { CiProviderService } from '../../core/services/ci-provider.service';
import { CiRepo, CiWorkflow } from '../../core/interfaces/ci-provider.interface';
import { ToastService } from '../../shared/services/toast.service';
import { NotificationService } from '../../core/services/notification.service';

interface StepInput {
  key: string;
  value: string;
  description?: string;
}

@Component({
  selector: 'app-chain-builder',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslateModule],
  templateUrl: './chain-builder.component.html',
  styleUrl: './chain-builder.component.scss',
})
export class ChainBuilderComponent {
  private readonly ci = inject(CiProviderService);
  private readonly chainSvc = inject(ChainService);
  private readonly executor = inject(ChainExecutorService);
  private readonly toasts = inject(ToastService);
  private readonly notif = inject(NotificationService);

  // ── Data ──────────────────────────────────────────────────────────────────────
  readonly chains = this.chainSvc.chains;
  readonly runs = this.chainSvc.runs;

  // ── Chain search ──────────────────────────────────────────────────────────────
  chainSearch = signal('');

  // ── Selection / Editor ────────────────────────────────────────────────────────
  selectedId = signal<string | null>(null);
  chainName = signal('');
  chainRef = signal('');
  editSteps = signal<ChainStep[]>([]);
  activeTab = signal<'chains' | 'editor' | 'run'>('chains');

  // ── Add-step form ─────────────────────────────────────────────────────────────
  repos = signal<CiRepo[]>([]);
  reposLoading = signal(false);
  repoSearch = signal('');
  stepRepo = signal<CiRepo | null>(null);
  stepWfs = signal<CiWorkflow[]>([]);
  stepWfLoad = signal(false);
  stepWf = signal<CiWorkflow | null>(null);
  stepRef = signal('main');
  stepOverrideRef = signal(false);
  stepBranches = signal<string[]>([]);
  stepInputs = signal<StepInput[]>([]);
  stepClearCache = signal(false);
  stepUseLatestTag = signal(false);
  wfInputsLoading = signal(false);
  showAddStep = signal(false);
  editingStepId = signal<string | null>(null);

  // ── Executor ──────────────────────────────────────────────────────────────────
  readonly activeRun = computed(() => this.executor.activeRuns()[this.selectedId() ?? ''] ?? null);
  dragStepIndex = signal<number | null>(null);
  selectedStepIds = signal<string[]>([]);

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly running = computed(() => this.activeRun()?.status === 'running');

  readonly filteredChains = computed(() => {
    const q = this.chainSearch().toLowerCase().trim();
    return q ? this.chains().filter((c) => c.name.toLowerCase().includes(q)) : this.chains();
  });

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    const list = this.repos();
    return q ? list.filter((r) => r.full_name.toLowerCase().includes(q)) : list;
  });

  readonly selectedChain = computed(() => {
    const id = this.selectedId();
    return id && id !== 'new' ? (this.chains().find((c) => c.id === id) ?? null) : null;
  });

  readonly chainRuns = computed(() => {
    const id = this.selectedId();
    return id && id !== 'new' ? this.runs().filter((r) => r.chainId === id) : [];
  });

  readonly canRun = computed(
    () => this.selectedStepIds().length > 0 && this.activeRun()?.status !== 'running',
  );

  readonly allStepsSelected = computed(() => {
    const ids = this.selectedStepIds();
    return this.editSteps().length > 0 && this.editSteps().every((s) => ids.includes(s.id));
  });

  readonly showRepoDropdown = computed(() => {
    const q = this.repoSearch().trim();
    return !!q && !this.stepRepo() && this.filteredRepos().length > 0;
  });

  readonly isGitLabRepo = computed(() => this.stepRepo()?.provider === 'gitlab');

  // ── Chain list ────────────────────────────────────────────────────────────────
  selectChain(chain: Chain): void {
    this.selectedId.set(chain.id);
    this.chainName.set(chain.name);
    this.chainRef.set(chain.ref ?? '');
    this.editSteps.set(chain.steps.map((s) => ({ ...s })));
    this.selectedStepIds.set(chain.steps.map((s) => s.id));
    this.showAddStep.set(false);
    this.activeTab.set('editor');
    this.resetStepForm();
  }

  newChain(): void {
    this.selectedId.set('new');
    this.chainName.set('');
    this.chainRef.set('');
    this.editSteps.set([]);
    this.selectedStepIds.set([]);
    this.showAddStep.set(false);
    this.activeTab.set('editor');
    this.resetStepForm();
  }

  // ── Editor ────────────────────────────────────────────────────────────────────
  saveChain(): void {
    const name = this.chainName().trim();
    if (!name) {
      this.toasts.show('Chain name is required', 'danger');
      return;
    }
    if (!this.editSteps().length) {
      this.toasts.show('Add at least one step', 'danger');
      return;
    }
    const id = this.selectedId() === 'new' ? crypto.randomUUID() : this.selectedId()!;
    const chain: Chain = {
      id,
      name,
      ref: this.chainRef().trim(),
      steps: this.editSteps(),
      createdAt: this.selectedChain()?.createdAt ?? new Date().toISOString(),
    };
    this.chainSvc.saveChain(chain);
    this.selectedId.set(id);
    this.toasts.show('Chain saved', 'success');
  }

  deleteChain(): void {
    const id = this.selectedId();
    if (!id || id === 'new') return;
    this.toasts.confirm(`Delete chain "${this.chainName()}"?`, 'Delete', () => {
      this.chainSvc.deleteChain(id);
      this.selectedId.set(null);
      this.toasts.show('Chain deleted', 'success');
    });
  }

  onStepDragStart(index: number): void {
    this.dragStepIndex.set(index);
  }

  onStepDragEnter(index: number): void {
    const from = this.dragStepIndex();
    if (from === null || from === index) return;
    this.editSteps.update((steps) => {
      const next = [...steps];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      return next;
    });
    this.dragStepIndex.set(index);
  }

  onStepDragEnd(): void {
    this.dragStepIndex.set(null);
  }

  removeStep(i: number): void {
    const step = this.editSteps()[i];
    this.toasts.confirm(`Remove step "${step.workflowName}"?`, 'Remove', () => {
      this.editSteps.update((list) => list.filter((_, idx) => idx !== i));
      this.selectedStepIds.update((ids) => ids.filter((id) => id !== step.id));
      if (this.editingStepId() === step.id) this.cancelAddStep();
      this.toasts.show('Step removed', 'success');
    });
  }

  // ── Add-step form ─────────────────────────────────────────────────────────────
  openAddStep(): void {
    this.showAddStep.set(true);
    if (!this.repos().length) this.loadRepos();
  }

  loadRepos(): void {
    this.reposLoading.set(true);
    this.ci.listRepos().subscribe({
      next: (r) => {
        this.repos.set(r);
        this.reposLoading.set(false);
      },
      error: () => this.reposLoading.set(false),
    });
  }

  onRepoSearchChange(val: string): void {
    this.repoSearch.set(val);
    if (this.stepRepo() && val !== this.stepRepo()!.full_name) {
      this.stepRepo.set(null);
      this.stepWfs.set([]);
      this.stepWf.set(null);
      this.stepInputs.set([]);
    }
  }

  onOverrideChange(checked: boolean): void {
    this.stepOverrideRef.set(checked);
    if (checked) {
      this.stepUseLatestTag.set(false);
      const repo = this.stepRepo();
      this.stepRef.set(repo?.default_branch || this.chainRef().trim() || 'main');
    }
  }

  onUseLatestTagChange(checked: boolean): void {
    this.stepUseLatestTag.set(checked);
    if (checked) this.stepOverrideRef.set(false);
  }

  selectStepRepo(repo: CiRepo): void {
    this.stepRepo.set(repo);
    this.repoSearch.set(repo.full_name);
    if (this.stepOverrideRef()) this.stepRef.set(repo.default_branch || 'main');
    this.stepWf.set(null);
    this.stepWfs.set([]);
    this.stepBranches.set([]);
    this.stepInputs.set([]);

    // Load branches for ref selection (both providers)
    this.ci.listBranches(repo.full_name, repo.provider).subscribe({
      next: (bs) => this.stepBranches.set(bs.map((b) => b.name)),
      error: () => {},
    });

    if (repo.provider === 'gitlab') {
      // GitLab: no workflow concept — auto-set to default pipeline
      const pipelineWf: CiWorkflow = { id: 0, name: 'Pipeline', path: '.gitlab-ci.yml' };
      this.stepWfs.set([pipelineWf]);
      this.stepWf.set(pipelineWf);
      this.stepWfLoad.set(false);
    } else {
      this.stepWfLoad.set(true);
      this.ci.listWorkflows(repo).subscribe({
        next: (wfs) => {
          this.stepWfs.set(wfs);
          this.stepWfLoad.set(false);
        },
        error: () => this.stepWfLoad.set(false),
      });
    }
  }

  onWorkflowSelect(wf: CiWorkflow): void {
    this.stepWf.set(wf);
    this.stepInputs.set([]);
    const repo = this.stepRepo();
    if (!repo || this.editingStepId() || repo.provider === 'gitlab') return;
    this.wfInputsLoading.set(true);
    this.ci.getWorkflowInputsYaml(repo, wf.path).subscribe({
      next: (yaml) => {
        this.stepInputs.set(parseDispatchInputs(yaml));
        this.wfInputsLoading.set(false);
      },
      error: () => this.wfInputsLoading.set(false),
    });
  }

  addStepInput(): void {
    this.stepInputs.update((a) => [...a, { key: '', value: '' }]);
  }
  removeStepInput(i: number): void {
    this.stepInputs.update((a) => a.filter((_, idx) => idx !== i));
  }

  editStep(step: ChainStep): void {
    this.editingStepId.set(step.id);
    this.showAddStep.set(true);
    if (!this.repos().length) this.loadRepos();

    const provider = step.provider ?? 'github';
    const fakeRepo: CiRepo = {
      id: 0,
      name: step.repoName,
      full_name: step.repoFullName,
      private: false,
      html_url: '',
      default_branch: step.ref,
      provider,
    };
    this.stepRepo.set(fakeRepo);
    this.repoSearch.set(step.repoFullName);

    if (provider === 'gitlab') {
      const pipelineWf: CiWorkflow = { id: 0, name: 'Pipeline', path: '.gitlab-ci.yml' };
      this.stepWfs.set([pipelineWf]);
      this.stepWf.set(pipelineWf);
      this.stepWfLoad.set(false);
    } else {
      this.stepWfLoad.set(true);
      this.ci.listWorkflows(fakeRepo).subscribe({
        next: (wfs) => {
          this.stepWfs.set(wfs);
          this.stepWf.set(wfs.find((w) => w.id === step.workflowId) ?? null);
          this.stepWfLoad.set(false);
        },
        error: () => this.stepWfLoad.set(false),
      });
    }

    this.ci.listBranches(step.repoFullName, provider).subscribe({
      next: (bs) => this.stepBranches.set(bs.map((b) => b.name)),
      error: () => {},
    });

    const chainDefaultRef = this.chainRef().trim() || 'main';
    this.stepOverrideRef.set(step.ref !== chainDefaultRef);
    this.stepRef.set(step.ref);
    this.stepInputs.set(Object.entries(step.inputs).map(([key, value]) => ({ key, value })));
    this.stepClearCache.set(step.clearCache ?? false);
    this.stepUseLatestTag.set(step.useLatestTag ?? false);
  }

  addStep(): void {
    const repo = this.stepRepo();
    const wf = this.stepWf();
    if (!repo || !wf) {
      this.toasts.show('Select a repo', 'danger');
      return;
    }
    const inputs = this.stepInputs()
      .filter((p) => p.key.trim() && p.value.trim())
      .reduce(
        (acc, p) => ({ ...acc, [p.key.trim()]: p.value.trim() }),
        {} as Record<string, string>,
      );
    const ref = this.stepOverrideRef()
      ? this.stepRef().trim() || 'main'
      : this.chainRef().trim() || 'main';
    const clearCache = this.stepClearCache();
    const useLatestTag = this.stepUseLatestTag();
    const editingId = this.editingStepId();

    if (editingId) {
      this.editSteps.update((list) =>
        list.map((s) =>
          s.id === editingId
            ? {
                ...s,
                repoFullName: repo.full_name,
                repoName: repo.name,
                workflowId: wf.id,
                workflowName: wf.name,
                ref,
                inputs,
                clearCache,
                useLatestTag,
                provider: repo.provider,
              }
            : s,
        ),
      );
      this.toasts.show(`Step "${wf.name}" updated`, 'success');
    } else {
      const step: ChainStep = {
        id: crypto.randomUUID(),
        repoFullName: repo.full_name,
        repoName: repo.name,
        workflowId: wf.id,
        workflowName: wf.name,
        ref,
        inputs,
        clearCache,
        useLatestTag,
        provider: repo.provider,
      };
      this.editSteps.update((list) => [...list, step]);
      this.selectedStepIds.update((ids) => [...ids, step.id]);
      this.toasts.show(`Step "${wf.name}" added`, 'success');
    }
    this.resetStepForm();
    this.showAddStep.set(false);
  }

  cancelAddStep(): void {
    this.showAddStep.set(false);
    this.resetStepForm();
  }

  private resetStepForm(): void {
    this.repoSearch.set('');
    this.stepRepo.set(null);
    this.stepWfs.set([]);
    this.stepWf.set(null);
    this.stepBranches.set([]);
    this.stepRef.set('main');
    this.stepOverrideRef.set(false);
    this.stepClearCache.set(false);
    this.stepUseLatestTag.set(false);
    this.editingStepId.set(null);
    this.stepInputs.set([]);
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async runChain(): Promise<void> {
    if (!this.canRun()) return;
    await this.notif.requestPermission();
    const name = this.chainName().trim();
    const allSteps = this.editSteps();
    const selected = new Set(this.selectedStepIds());
    const steps = allSteps.filter((s) => selected.has(s.id));
    if (!name || !steps.length) return;
    const id = this.selectedId() === 'new' ? crypto.randomUUID() : this.selectedId()!;
    const chain: Chain = {
      id,
      name,
      ref: this.chainRef().trim(),
      steps,
      createdAt: this.selectedChain()?.createdAt ?? new Date().toISOString(),
    };
    this.chainSvc.saveChain({ ...chain, steps: allSteps });
    this.selectedId.set(id);
    this.activeTab.set('run');
    await this.executor.execute(chain);
  }

  toggleStepSelection(stepId: string): void {
    this.selectedStepIds.update((ids) =>
      ids.includes(stepId) ? ids.filter((id) => id !== stepId) : [...ids, stepId],
    );
  }

  toggleAllSteps(): void {
    const all = this.editSteps().map((s) => s.id);
    this.selectedStepIds.set(this.allStepsSelected() ? [] : all);
  }

  stopChain(): void {
    const id = this.selectedId();
    if (id) this.executor.stop(id);
  }

  // ── Export / Import ───────────────────────────────────────────────────────────
  exportChain(): void {
    const chain = this.buildChainSnapshot();
    if (!chain) return;
    const blob = new Blob([JSON.stringify(chain, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chain-${chain.name.replaceAll(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importChain(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const data = JSON.parse(text);
        if (!data?.name || !Array.isArray(data?.steps)) {
          this.toasts.show('Invalid chain file', 'danger');
          return;
        }
        const chain: Chain = {
          id: crypto.randomUUID(),
          name: data.name,
          ref: data.ref ?? '',
          steps: data.steps.map((s: ChainStep) => ({ ...s, id: crypto.randomUUID() })),
          createdAt: new Date().toISOString(),
        };
        this.chainSvc.saveChain(chain);
        this.selectChain(chain);
        this.toasts.show(`Chain "${chain.name}" imported`, 'success');
      } catch {
        this.toasts.show('Could not read file', 'danger');
      }
      (event.target as HTMLInputElement).value = '';
    });
  }

  private buildChainSnapshot(): Chain | null {
    const name = this.chainName().trim();
    if (!name) {
      this.toasts.show('Save the chain first', 'danger');
      return null;
    }
    return {
      id: this.selectedId() === 'new' ? crypto.randomUUID() : this.selectedId()!,
      name,
      ref: this.chainRef().trim(),
      steps: this.editSteps(),
      createdAt: this.selectedChain()?.createdAt ?? new Date().toISOString(),
    };
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  stepIcon(status: string): string {
    return (
      (
        { pending: '○', running: '◌', success: '✓', failure: '✕', skipped: '–' } as Record<
          string,
          string
        >
      )[status] ?? '○'
    );
  }

  runStatusColor(status: string): string {
    return (
      (
        { running: 'info', success: 'success', failure: 'danger', stopped: 'muted' } as Record<
          string,
          string
        >
      )[status] ?? 'muted'
    );
  }

  hasInputs(inputs: Record<string, string>): boolean {
    return Object.keys(inputs).length > 0;
  }

  inputsSummary(inputs: Record<string, string>): string {
    return Object.entries(inputs)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
  }

  getStepRun(stepId: string): ChainStepRun | undefined {
    return this.activeRun()?.steps.find((sr) => sr.stepId === stepId);
  }

  getStepEffectiveStatus(stepId: string): StepStatus {
    const sr = this.getStepRun(stepId);
    if (sr) return sr.status;
    if (!this.selectedStepIds().includes(stepId)) return 'skipped';
    return 'pending';
  }

  isActiveChain(): boolean {
    const run = this.activeRun();
    return !!run && run.chainId === this.selectedId();
  }

  stepProviderBadge(step: ChainStep): string {
    return step.provider === 'gitlab' ? 'GL' : 'GH';
  }
}
