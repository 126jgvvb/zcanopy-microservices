import {Entity,Column,PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class CustomerSearchEntity{
  @PrimaryGeneratedColumn()
  id!:string;

  @Column({default:''})
  sessionId!:string;

  @Column({default:''})
  sessionToken!:string;

  @Column({default:''})
  query!:string;

  @Column({default:''})
  location!:string;

  @Column({default:0})
  radius!:number;

  @Column({default:''})
  propertyType!:string;

  @Column({default:''})
  filtersJson!:string;

  @Column({default:''})
  resultPropertyIdsJson!:string;

  @Column({default:0})
  resultCount!:number;

  @Column({default:0})
  minPrice!:number;

  @Column({default:0})
  maxPrice!:number;

  @Column({default:''})
  subCounty!:string;

  @Column({default:''})
  district!:string;

  @Column({default: new Date()})
  createdAt!:Date;
}
