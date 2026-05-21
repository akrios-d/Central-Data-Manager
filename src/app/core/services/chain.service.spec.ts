import { TestBed } from '@angular/core/testing';
import { ChainService } from './chain.service';
import { Chain, ChainRun } from '../models/chain.model';

describe('ChainService', () => {
  let svc: ChainService;

  const makeChain = (id = 'c1'): Chain => ({
    id,
    name: 'Test chain',
    ref: 'main',
    steps: [],
    createdAt: new Date().toISOString(),
  });

  const makeRun = (id: string, chainId = 'c1'): ChainRun => ({
    id,
    chainId,
    chainName: 'Test chain',
    startedAt: new Date().toISOString(),
    status: 'success',
    steps: [],
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ChainService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  describe('chains', () => {
    it('starts empty', () => {
      expect(svc.chains()).toHaveLength(0);
    });

    it('saveChain() adds a new chain', () => {
      svc.saveChain(makeChain());
      expect(svc.chains()).toHaveLength(1);
      expect(svc.chains()[0].id).toBe('c1');
    });

    it('saveChain() upserts — replaces existing chain by id', () => {
      svc.saveChain(makeChain());
      svc.saveChain({ ...makeChain(), name: 'Updated' });
      expect(svc.chains()).toHaveLength(1);
      expect(svc.chains()[0].name).toBe('Updated');
    });

    it('saveChain() handles multiple chains independently', () => {
      svc.saveChain(makeChain('c1'));
      svc.saveChain(makeChain('c2'));
      svc.saveChain(makeChain('c3'));
      expect(svc.chains()).toHaveLength(3);
    });

    it('deleteChain() removes by id', () => {
      svc.saveChain(makeChain());
      svc.deleteChain('c1');
      expect(svc.chains()).toHaveLength(0);
    });

    it('deleteChain() ignores unknown id', () => {
      svc.saveChain(makeChain());
      svc.deleteChain('unknown');
      expect(svc.chains()).toHaveLength(1);
    });

    it('getChain() returns the chain by id', () => {
      svc.saveChain(makeChain());
      expect(svc.getChain('c1')?.name).toBe('Test chain');
    });

    it('getChain() returns undefined for missing id', () => {
      expect(svc.getChain('missing')).toBeUndefined();
    });

    it('persists chains to localStorage after saveChain()', () => {
      svc.saveChain(makeChain());
      const raw = localStorage.getItem('cdm:chains');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toHaveLength(1);
    });

    it('persists chains to localStorage after deleteChain()', () => {
      svc.saveChain(makeChain());
      svc.deleteChain('c1');
      const raw = localStorage.getItem('cdm:chains');
      expect(JSON.parse(raw!)).toHaveLength(0);
    });

    it('does not crash when localStorage contains invalid JSON', () => {
      localStorage.setItem('cdm:chains', '{{bad');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const svc2 = TestBed.inject(ChainService);
      expect(svc2.chains()).toHaveLength(0);
    });
  });

  describe('restoreAll()', () => {
    it('replaces all chains with the provided array', () => {
      svc.saveChain(makeChain('c1'));
      svc.restoreAll([makeChain('c2'), makeChain('c3')]);
      expect(svc.chains()).toHaveLength(2);
      expect(svc.chains().map((c) => c.id)).toContain('c2');
      expect(svc.chains().map((c) => c.id)).toContain('c3');
    });

    it('accepts an empty array and clears all chains', () => {
      svc.saveChain(makeChain('c1'));
      svc.restoreAll([]);
      expect(svc.chains()).toHaveLength(0);
    });

    it('persists the restored chains to localStorage', () => {
      svc.restoreAll([makeChain('c99')]);
      const raw = localStorage.getItem('cdm:chains');
      expect(JSON.parse(raw!)[0].id).toBe('c99');
    });
  });

  describe('runs', () => {
    it('starts empty', () => {
      expect(svc.runs()).toHaveLength(0);
    });

    it('saveRun() adds a run', () => {
      svc.saveRun(makeRun('r1'));
      expect(svc.runs()).toHaveLength(1);
    });

    it('saveRun() upserts by id', () => {
      svc.saveRun(makeRun('r1'));
      svc.saveRun({ ...makeRun('r1'), status: 'failure' });
      expect(svc.runs()).toHaveLength(1);
      expect(svc.runs()[0].status).toBe('failure');
    });

    it('saveRun() prepends — most recent run is first', () => {
      svc.saveRun(makeRun('r1'));
      svc.saveRun(makeRun('r2'));
      expect(svc.runs()[0].id).toBe('r2');
    });

    it('saveRun() persists runs to localStorage', () => {
      svc.saveRun(makeRun('r1'));
      const raw = localStorage.getItem('cdm:chain-runs');
      expect(JSON.parse(raw!)).toHaveLength(1);
    });

    it('does not crash when runs localStorage contains invalid JSON', () => {
      localStorage.setItem('cdm:chain-runs', 'broken{{');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const svc2 = TestBed.inject(ChainService);
      expect(svc2.runs()).toHaveLength(0);
    });

    it('keeps at most 50 runs', () => {
      for (let i = 0; i < 55; i++) svc.saveRun(makeRun(`r${i}`));
      expect(svc.runs()).toHaveLength(50);
    });

    it('runsFor() returns only runs belonging to the given chainId', () => {
      svc.saveRun(makeRun('r1', 'c1'));
      svc.saveRun(makeRun('r2', 'c2'));
      svc.saveRun(makeRun('r3', 'c1'));
      const forC1 = svc.runs().filter((r) => r.chainId === 'c1');
      expect(forC1).toHaveLength(2);
      expect(forC1.every((r) => r.chainId === 'c1')).toBe(true);
    });

    it('runsFor() returns empty array when no runs match chainId', () => {
      svc.saveRun(makeRun('r1', 'c1'));
      const forC99 = svc.runs().filter((r) => r.chainId === 'c99');
      expect(forC99).toHaveLength(0);
    });
  });

  describe('deleteChain() cascade', () => {
    it('does not affect runs belonging to other chains', () => {
      svc.saveChain(makeChain('c1'));
      svc.saveChain(makeChain('c2'));
      svc.saveRun(makeRun('r1', 'c1'));
      svc.saveRun(makeRun('r2', 'c2'));
      svc.deleteChain('c1');
      const remaining = svc.runs().filter((r) => r.chainId === 'c2');
      expect(remaining).toHaveLength(1);
    });
  });
});
