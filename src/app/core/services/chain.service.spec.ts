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

  const makeRun = (id: string): ChainRun => ({
    id,
    chainId: 'c1',
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

    it('saveChain adds a new chain', () => {
      svc.saveChain(makeChain());
      expect(svc.chains()).toHaveLength(1);
      expect(svc.chains()[0].id).toBe('c1');
    });

    it('saveChain upserts — replaces existing by id', () => {
      svc.saveChain(makeChain());
      svc.saveChain({ ...makeChain(), name: 'Updated' });
      expect(svc.chains()).toHaveLength(1);
      expect(svc.chains()[0].name).toBe('Updated');
    });

    it('deleteChain removes by id', () => {
      svc.saveChain(makeChain());
      svc.deleteChain('c1');
      expect(svc.chains()).toHaveLength(0);
    });

    it('deleteChain ignores unknown id', () => {
      svc.saveChain(makeChain());
      svc.deleteChain('unknown');
      expect(svc.chains()).toHaveLength(1);
    });

    it('getChain returns the chain by id', () => {
      svc.saveChain(makeChain());
      expect(svc.getChain('c1')?.name).toBe('Test chain');
    });

    it('getChain returns undefined for missing id', () => {
      expect(svc.getChain('missing')).toBeUndefined();
    });

    it('persists to localStorage', () => {
      svc.saveChain(makeChain());
      const raw = localStorage.getItem('cdm:chains');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
    });
  });

  describe('runs', () => {
    it('starts empty', () => {
      expect(svc.runs()).toHaveLength(0);
    });

    it('saveRun adds a run', () => {
      svc.saveRun(makeRun('r1'));
      expect(svc.runs()).toHaveLength(1);
    });

    it('saveRun upserts by id', () => {
      svc.saveRun(makeRun('r1'));
      svc.saveRun({ ...makeRun('r1'), status: 'failure' });
      expect(svc.runs()).toHaveLength(1);
      expect(svc.runs()[0].status).toBe('failure');
    });

    it('saveRun prepends — most recent run is first', () => {
      svc.saveRun(makeRun('r1'));
      svc.saveRun(makeRun('r2'));
      expect(svc.runs()[0].id).toBe('r2');
    });

    it('keeps at most 50 runs', () => {
      for (let i = 0; i < 55; i++) svc.saveRun(makeRun(`r${i}`));
      expect(svc.runs()).toHaveLength(50);
    });
  });
});
