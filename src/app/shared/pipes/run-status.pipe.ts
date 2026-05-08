import { Pipe, PipeTransform } from '@angular/core';
import { GhRun } from '../../core/services/github-api.service';

@Pipe({ name: 'runStatus', standalone: true })
export class RunStatusPipe implements PipeTransform {
  transform(run: GhRun): string {
    if (run.status !== 'completed') return run.status.replace('_', ' ');
    return run.conclusion ?? 'unknown';
  }
}
