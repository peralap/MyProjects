import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'age', standalone: true })
export class AgePipe implements PipeTransform {
  transform(value: string): number {
    const birthDate = new Date(`${value.slice(0, 10)}T00:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const beforeBirthday = today.getMonth() < birthDate.getMonth()
      || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
    if (beforeBirthday) age -= 1;
    return age;
  }
}
