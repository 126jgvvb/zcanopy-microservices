import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class LogEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({default:'1'})
  level!: string;

  @Column({default:'unknown'})
  service!: string;

  @Column({default:'this is a default message'})
  message!: string;

  @Column({default:'no meta-data'})
  metadata!: string;

  @CreateDateColumn({default:new Date()})
  timestamp!: Date;
}
