import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AdminEntity } from './admin.entity';

@Entity()
export class AdminMessageEntity {
  @PrimaryGeneratedColumn()
  id!: string;

  @Column({type:'integer',default:1})
  adminId!: number;

  @Column({default:'delos'})
  adminUsername!: string;

  @Column({default:'agnes'})
  recipientType!: string;

  @Column({default:'107000000000'})
  recipientPhone?: string;

  @Column({default:'agnes@gmail.com'})
  recipientEmail?: string;

  @Column({default:'agnes'})
  recipientName?: string;

  @Column({default:'emergency'})
  messageType!: string;

  @Column({default:'any'})
  subject?: string;

  @Column({default:'hello world'})
  body!: string;

  @Column({default:'any'})
  channel!: string;

  @Column({default:'any'})
  status!: string;

  @Column({default:'time laps'})
  errorMessage?: string;

  @CreateDateColumn({default:new Date()})
  sentAt!: Date;

  @ManyToOne(() => AdminEntity, { eager: false })
  @JoinColumn({ name: 'adminId', referencedColumnName: 'id' })
  admin?: AdminEntity;
}
