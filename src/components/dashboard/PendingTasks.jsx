import { Link } from "react-router-dom"
import { ArrowRightIcon, ClockIcon } from "../Icons"

function PendingTasks() {
  return (
    <div>
      <h3 className="text-xl font-bold mb-4">Pending Tasks</h3>

      <div className="space-y-4">
        <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning-foreground mb-2">
                Follow-up
              </span>
              <h4 className="font-medium">ABC Corp</h4>
              <p className="text-sm text-slate-500">Enquiry No: En-01</p>
            </div>
            <div className="flex items-center text-warning-foreground text-sm">
              <ClockIcon className="h-4 w-4 mr-1" />
              Today
            </div>
          </div>
          <div className="mt-3">
            <Link to="/call-tracker/new?leadId=1">
              <button className="w-full px-4 py-2 text-sm font-medium rounded-md border border-warning/30 text-warning-foreground bg-white hover:bg-warning/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-warning">
                Call Now <ArrowRightIcon className="ml-2 h-3 w-3 inline" />
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mb-2">
                Quotation
              </span>
              <h4 className="font-medium">XYZ Industries</h4>
              <p className="text-sm text-slate-500">Enquiry No: En-05</p>
            </div>
            <div className="flex items-center text-primary text-sm">
              <ClockIcon className="h-4 w-4 mr-1" />
              Tomorrow
            </div>
          </div>
          <div className="mt-3">
            <Link to="/quotations/new?enquiryNo=En-05">
              <button className="w-full px-4 py-2 text-sm font-medium rounded-md border border-primary/30 text-primary bg-white hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                Create Quotation <ArrowRightIcon className="ml-2 h-3 w-3 inline" />
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-success/5 border border-success/20 rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success mb-2">
                Order Status
              </span>
              <h4 className="font-medium">PQR Ltd</h4>
              <p className="text-sm text-slate-500">Quotation No: Q-003</p>
            </div>
            <div className="flex items-center text-success text-sm">
              <ClockIcon className="h-4 w-4 mr-1" />
              In 2 days
            </div>
          </div>
          <div className="mt-3">
            <Link to="/enquiry-tracker/new?enquiryNo=En-03">
              <button className="w-full px-4 py-2 text-sm font-medium rounded-md border border-success/30 text-success bg-white hover:bg-success/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-success">
                Update Status <ArrowRightIcon className="ml-2 h-3 w-3 inline" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center">
        <Link to="/tasks">
          <button className="text-slate-500 hover:text-slate-700 text-sm font-medium">View all pending tasks</button>
        </Link>
      </div>
    </div>
  )
}

export default PendingTasks
