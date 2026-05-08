import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Chain, ChainStep, ChainStepRun } from '../../core/models/chain.model';
import { ChainService } from '../../core/services/chain.service';
import { ChainExecutorService } from '../../core/services/chain-executor.service';
import { GitHubApiService, GhRepo, GhWorkflow } from '../../core/services/github-api.service';
import { ToastService } from '../../shared/services/toast.service';

interface StepInput { key: string; value: string; }

@Component({
  selector: 'app-chain-builder',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './chain-builder.component.html',
  styleUrl: './chain-builder.component.scss',
})
export class ChainBuilderComponent {
  private gh       = inject(GitHubApiService);
  private chainSvc = inject(ChainService);
  private executor = inject(ChainExecutorService);
  private toasts   = inject(ToastService);

  // ── Data ──────────────────────────────────────────────────────────────────────
  readonly chains = this.chainSvc.chains;
  readonly runs   = this.chainSvc.runs;

  // ── Selection / Editor ────────────────────────────────────────────────────────
  selectedId = signal<string | null>(null);
  chainName  = signal('');
  chainRef   = signal('');
  editSteps  = signal<ChainStep[]>([]);

  // ── Add-step form ─────────────────────────────────────────────────────────────
  repos        = signal<GhRepo[]>([]);
  reposLoading = signal(false);
  repoSearch   = signal('');
  stepRepo     = signal<GhRepo | null>(null);
  stepWfs      = signal<GhWorkflow[]>([]);
  stepWfLoad   = signal(false);
  stepWf          = signal<GhWorkflow | null>(null);
  stepRef         = signal('main');
  stepOverrideRef = signal(false);
  stepBranches    = signal<string[]>([]);
  stepInputs:      StepInput[] = [];
  showAddStep   = signal(false);
  editingStepId = signal<string | null>(null);

  // ── Executor ──────────────────────────────────────────────────────────────────
  readonly activeRun = this.executor.activeRun;
  running = signal(false);

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    const list = this.repos();
    return q ? list.filter(r => r.full_name.toLowerCase().includes(q)) : list;
  });

  readonly selectedChain = computed(() => {
    const id = this.selectedId();
    return id && id !== 'new' ? (this.chains().find(c => c.id === id) ?? null) : null;
  });

  readonly chainRuns = computed(() => {
    const id = this.selectedId();
    return id && id !== 'new' ? this.runs().filter(r => r.chainId === id) : [];
  });

  readonly canRun = computed(() => {
    const run = this.activeRun();
    return this.editSteps().length > 0 && !this.running() && (!run || run.status !== 'running');
  });

  readonly showRepoDropdown = computed(() => {
    const q = this.repoSearch().trim();
    return !!q && !this.stepRepo() && this.filteredRepos().length > 0;
  });

  // ── Chain list ────────────────────────────────────────────────────────────────
  selectChain(chain: Chain): void {
    this.selectedId.set(chain.id);
    this.chainName.set(chain.name);
    this.chainRef.set(chain.ref ?? '');
    this.editSteps.set(chain.steps.map(s => ({ ...s })));
    this.showAddStep.set(false);
    this.resetStepForm();
  }

  newChain(): void {
    this.selectedId.set('new');
    this.chainName.set('');
    this.chainRef.set('');
    this.editSteps.set([]);
    this.showAddStep.set(false);
    this.resetStepForm();
  }

  // ── Editor ────────────────────────────────────────────────────────────────────
  saveChain(): void {
    const name = this.chainName().trim();
    if (!name) { this.toasts.show('Chain name is required', 'danger'); return; }
    if (!this.editSteps().length) { this.toasts.show('Add at least one step', 'danger'); return; }
    const id = this.selectedId() !== 'new' ? this.selectedId()! : crypto.randomUUID();
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
    this.toasts.confirm(
      `Delete chain "${this.chainName()}"?`,
      'Delete',
      () => {
        this.chainSvc.deleteChain(id);
        this.selectedId.set(null);
        this.toasts.show('Chain deleted', 'success');
      }
    );
  }

  moveStep(i: number, dir: -1 | 1): void {
    const steps = [...this.editSteps()];
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    this.editSteps.set(steps);
  }

  removeStep(i: number): void {
    const step = this.editSteps()[i];
    this.toasts.confirm(
      `Remove step "${step.workflowName}"?`,
      'Remove',
      () => {
        this.editSteps.update(list => list.filter((_, idx) => idx !== i));
        this.toasts.show('Step removed', 'success');
      }
    );
  }

  // ── Add-step form ─────────────────────────────────────────────────────────────
  openAddStep(): void {
    this.showAddStep.set(true);
    if (!this.repos().length) this.loadRepos();
  }

  loadRepos(): void {
    this.reposLoading.set(true);
    this.gh.listRepos().subscribe({
      next: (r)  => { this.repos.set(r); this.reposLoading.set(false); },
      error: ()  => this.reposLoading.set(false),
    });
  }

  onRepoSearchChange(val: string): void {
    this.repoSearch.set(val);
    if (this.stepRepo() && val !== this.stepRepo()!.full_name) {
      this.stepRepo.set(null);
      this.stepWfs.set([]);
      this.stepWf.set(null);
    }
  }

  onOverrideChange(checked: boolean): void {
    this.stepOverrideRef.set(checked);
    if (checked) {
      const repo = this.stepRepo();
      this.stepRef.set(repo?.default_branch || this.chainRef().trim() || 'main');
    }
  }

  selectStepRepo(repo: GhRepo): void {
    this.stepRepo.set(repo);
    this.repoSearch.set(repo.full_name);
    if (this.stepOverrideRef()) {
      this.stepRef.set(repo.default_branch || 'main');
    }
    this.stepWf.set(null);
    this.stepWfs.set([]);
    this.stepBranches.set([]);
    this.stepWfLoad.set(true);
    this.gh.listWorkflows(repo.full_name).subscribe({
      next: (res) => { this.stepWfs.set(res.workflows.filter(w => w.state === 'active')); this.stepWfLoad.set(false); },
      error: ()   => this.stepWfLoad.set(false),
    });
    this.gh.listBranches(repo.full_name).subscribe({
      next: (bs) => this.stepBranches.set(bs.map(b => b.name)),
      error: ()  => {},
    });
  }

  addStepInput(): void         { this.stepInputs.push({ key: '', value: '' }); }
  removeStepInput(i: number):void { this.stepInputs.splice(i, 1); }

  editStep(step: ChainStep): void {
    this.editingStepId.set(step.id);
    this.showAddStep.set(true);
    if (!this.repos().length) this.loadRepos();

    // Restore repo (synthetic GhRepo from saved data)
    const fakeRepo: GhRepo = {
      id: 0, name: step.repoName, full_name: step.repoFullName,
      private: false, html_url: '', default_branch: step.ref,
    };
    this.stepRepo.set(fakeRepo);
    this.repoSearch.set(step.repoFullName);

    // Load workflows & branches for this repo
    this.stepWfLoad.set(true);
    this.gh.listWorkflows(step.repoFullName).subscribe({
      next: (res) => {
        this.stepWfs.set(res.workflows.filter(w => w.state === 'active'));
        this.stepWf.set(res.workflows.find(w => w.id === step.workflowId) ?? null);
        this.stepWfLoad.set(false);
      },
      error: () => this.stepWfLoad.set(false),
    });
    this.gh.listBranches(step.repoFullName).subscribe({
      next: (bs) => this.stepBranches.set(bs.map(b => b.name)),
      error: () => {},
    });

    const chainDefaultRef = this.chainRef().trim() || 'main';
    const hasOverride = step.ref !== chainDefaultRef;
    this.stepOverrideRef.set(hasOverride);
    this.stepRef.set(step.ref);

    this.stepInputs = Object.entries(step.inputs).map(([key, value]) => ({ key, value }));
  }

  addStep(): void {
    const repo = this.stepRepo();
    const wf   = this.stepWf();
    if (!repo || !wf) { this.toasts.show('Select a repo and workflow', 'danger'); return; }
    const inputs = this.stepInputs
      .filter(p => p.key.trim())
      .reduce((acc, p) => ({ ...acc, [p.key.trim()]: p.value }), {} as Record<string, string>);
    const ref = this.stepOverrideRef() ? (this.stepRef().trim() || 'main') : (this.chainRef().trim() || 'main');
    const editingId = this.editingStepId();

    if (editingId) {
      this.editSteps.update(list => list.map(s => s.id !== editingId ? s : {
        ...s, repoFullName: repo.full_name, repoName: repo.name,
        workflowId: wf.id, workflowName: wf.name, ref, inputs,
      }));
      this.toasts.show(`Step "${wf.name}" updated`, 'success');
    } else {
      const step: ChainStep = {
        id: crypto.randomUUID(),
        repoFullName: repo.full_name, repoName: repo.name,
        workflowId: wf.id, workflowName: wf.name, ref, inputs,
      };
      this.editSteps.update(list => [...list, step]);
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
    this.editingStepId.set(null);
    this.stepInputs = [];
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async runChain(): Promise<void> {
    if (!this.canRun()) return;
    const name  = this.chainName().trim();
    const steps = this.editSteps();
    if (!name || !steps.length) return;
    const id = this.selectedId() !== 'new' ? this.selectedId()! : crypto.randomUUID();
    const chain: Chain = {
      id,
      name,
      ref: this.chainRef().trim(),
      steps,
      createdAt: this.selectedChain()?.createdAt ?? new Date().toISOString(),
    };
    this.chainSvc.saveChain(chain);
    this.selectedId.set(id);
    this.running.set(true);
    try {
      await this.executor.execute(chain);
    } finally {
      this.running.set(false);
    }
  }

  stopChain(): void { this.executor.stop(); }

  // ── Export / Import ───────────────────────────────────────────────────────────
  exportChain(): void {
    const chain = this.buildChainSnapshot();
    if (!chain) return;
    const blob = new Blob([JSON.stringify(chain, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `chain-${chain.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importChain(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data?.name || !Array.isArray(data?.steps)) {
          this.toasts.show('Invalid chain file', 'danger');
          return;
        }
        const chain: Chain = {
          id:        crypto.randomUUID(),
          name:      data.name,
          ref:       data.ref ?? '',
          steps:     data.steps.map((s: ChainStep) => ({ ...s, id: crypto.randomUUID() })),
          createdAt: new Date().toISOString(),
        };
        this.chainSvc.saveChain(chain);
        this.selectChain(chain);
        this.toasts.show(`Chain "${chain.name}" imported`, 'success');
      } catch {
        this.toasts.show('Could not read file', 'danger');
      }
      (event.target as HTMLInputElement).value = '';
    };
    reader.readAsText(file);
  }

  private buildChainSnapshot(): Chain | null {
    const name = this.chainName().trim();
    if (!name) { this.toasts.show('Save the chain first', 'danger'); return null; }
    return {
      id:        this.selectedId() !== 'new' ? this.selectedId()! : crypto.randomUUID(),
      name,
      ref:       this.chainRef().trim(),
      steps:     this.editSteps(),
      createdAt: this.selectedChain()?.createdAt ?? new Date().toISOString(),
    };
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  stepIcon(status: string): string {
    return ({ pending: '○', running: '◌', success: '✓', failure: '✕', skipped: '–' } as Record<string, string>)[status] ?? '○';
  }

  runStatusColor(status: string): string {
    return ({ running: 'info', success: 'success', failure: 'danger', stopped: 'muted' } as Record<string, string>)[status] ?? 'muted';
  }

  hasInputs(inputs: Record<string, string>): boolean {
    return Object.keys(inputs).length > 0;
  }

  inputsSummary(inputs: Record<string, string>): string {
    return Object.entries(inputs).map(([k, v]) => `${k}=${v}`).join(', ');
  }

  getStepRun(stepId: string): ChainStepRun | undefined {
    return this.activeRun()?.steps.find(sr => sr.stepId === stepId);
  }

  isActiveChain(): boolean {
    const run = this.activeRun();
    return !!run && run.chainId === this.selectedId();
  }
}
