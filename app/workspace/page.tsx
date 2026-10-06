import Workspace from './workspace';
import '../portal/portal.css';
import './signin.css';
import './customer-controls.css';
export const metadata={title:'Customer workspace',robots:{index:false,follow:false},alternates:{canonical:'/workspace'}};
export default function Page(){return <Workspace/>;}
