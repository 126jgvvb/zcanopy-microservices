import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class LogEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column()
  level!: string;

  @Column()
  service!: string;

  @Column()
  message!: string;

  @Column()
  metadata!: string;

  @CreateDateColumn()
  timestamp!: Date;
}
