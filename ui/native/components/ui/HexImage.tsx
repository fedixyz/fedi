import { StyleSheet, View } from 'react-native'
import Svg, { Defs, Image, Path, Pattern, Rect } from 'react-native-svg'

type Props = {
    imageUrl: string
}

const HexImage = ({ imageUrl }: Props) => {
    const style = styles()
    return (
        <View style={style.container}>
            <Svg width="100%" height="100%" viewBox="0 0 22 24" fill="none">
                <Path
                    d="M9.4202 0.418094C10.3978 -0.139364 11.6022 -0.139365 12.5798 0.418094L20.3653 4.85775C21.3428 5.41521 21.945 6.44543 21.945 7.56035V16.4397C21.945 17.5546 21.3428 18.5848 20.3653 19.1423L12.5798 23.5819C11.6022 24.1394 10.3978 24.1394 9.4202 23.5819L1.63471 19.1423C0.657142 18.5848 0.0549316 17.5546 0.0549316 16.4397V7.56035C0.0549316 6.44543 0.657142 5.41521 1.63471 4.85775L9.4202 0.418094Z"
                    fill="url(#pattern0)"
                />

                <Defs>
                    <Pattern
                        id="pattern0"
                        patternUnits="userSpaceOnUse"
                        width="22"
                        height="24">
                        {/* Adds a white background for transparent images */}
                        <Rect width="22" height="24" fill="white" />
                        <Image
                            id="image0"
                            xlinkHref={{ uri: imageUrl }}
                            width="22"
                            height="24"
                            preserveAspectRatio="xMidYMid slice"
                        />
                    </Pattern>
                </Defs>
            </Svg>
        </View>
    )
}
const styles = () =>
    StyleSheet.create({
        container: {
            aspectRatio: 1,
            overflow: 'hidden',
            paddingHorizontal: 1.05,
        },
        svg: {
            position: 'absolute',
            top: 0,
            left: 0,
        },
    })
export default HexImage
