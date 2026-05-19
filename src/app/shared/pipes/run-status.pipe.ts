import { Pipe, PipeTransform } from '@angular/core';
import { CiRun } from '../../core/interfaces/ci-provider.interface';

@Pipe({ name: 'runStatus', standalone: true })
export class RunStatusPipe implements PipeTransform {
  transform(run: CiRun): string {
    if (run.status !== 'completed') return run.status.replace('_', ' ');
    return run.conclusion ?? 'unknown';
  }
}
