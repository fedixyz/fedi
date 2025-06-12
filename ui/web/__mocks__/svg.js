import React from 'react'

const SvgrMock = React.forwardRef((props, ref) => <span ref={ref} {...props} />)
SvgrMock.displayName = 'svgr-mock'
export const ReactComponent = SvgrMock
export default SvgrMock
